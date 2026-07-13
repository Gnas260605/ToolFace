/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, Get, Post, Delete, Param, Query, Body, Headers, UseGuards, BadRequestException, Res, ConflictException, Req } from '@nestjs/common';
import { Response } from 'express';
import { DatabaseService } from './common/database.service';
import { MockAuthGuard, PermissionsGuard, RequirePermissions } from './common/auth.guard';
import { SaasService } from './common/services/saas.service';
import { SecretEncryptionService, MockFacebookPagesProvider, FacebookPagesProvider, GraphApiFacebookPagesProvider } from '@newsflow/database';
import { randomBytes, createHash } from 'crypto';

@Controller('integrations/facebook')
export class FacebookOauthController {
  private facebookProvider: FacebookPagesProvider;

  constructor(private readonly db: DatabaseService) {
    this.facebookProvider = process.env.META_PROVIDER === 'mock'
      ? new MockFacebookPagesProvider()
      : new GraphApiFacebookPagesProvider();
  }

  /** Cast to `any` so IDE doesn't need to resolve Prisma generated types. Runtime is fine. */
  private get p(): any { return this.db; }


  @Get('connect')
  @UseGuards(MockAuthGuard, PermissionsGuard)
  @RequirePermissions('facebook_connections.manage')
  async startOauth(
    @Query('workspaceId') workspaceId: string,
    @Req() req: any,
    @Headers('x-forwarded-for') clientIp: string = 'unknown',
    @Headers('user-agent') userAgent: string = 'unknown',
    @Res() res: Response
  ) {
    if (!workspaceId) throw new BadRequestException('workspaceId is required');

    const userId = req.user?.id || 'mock-default-user-id';

    const state = randomBytes(32).toString('hex');
    const stateHash = createHash('sha256').update(state).digest('hex');
    const ipHash = createHash('sha256').update(clientIp).digest('hex');
    const userAgentHash = createHash('sha256').update(userAgent).digest('hex');

    const redirectUri = process.env.META_OAUTH_REDIRECT_URI || 'http://localhost:3001/api/v1/integrations/facebook/callback';
    const expiresAt = new Date(Date.now() + 600 * 1000); // 10 minutes

    await this.p.facebookOauthState.create({
      data: {
        workspaceId,
        userId,
        stateHash,
        redirectUri,
        expiresAt,
        ipHash,
        userAgentHash
      }
    });

    const authUrl = await this.facebookProvider.buildAuthorizationUrl({
      redirectUri,
      state
    });

    return res.redirect(authUrl);
  }

  @Get('callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    const stateHash = createHash('sha256').update(state).digest('hex');

    // Find state in DB
    const oauthState = await this.p.facebookOauthState.findFirst({
      where: { stateHash }
    });

    if (!oauthState) {
      return res.status(400).send('FACEBOOK_OAUTH_STATE_INVALID');
    }
    if (oauthState.usedAt) {
      return res.status(400).send('FACEBOOK_OAUTH_STATE_ALREADY_USED');
    }
    if (oauthState.expiresAt < new Date()) {
      return res.status(400).send('FACEBOOK_OAUTH_STATE_EXPIRED');
    }

    // Mark as used
    await this.p.facebookOauthState.update({
      where: { id: oauthState.id },
      data: { usedAt: new Date() }
    });

    try {
      const authData = await this.facebookProvider.exchangeAuthorizationCode({
        code,
        redirectUri: oauthState.redirectUri
      });

      // In production: store user token in Redis keyed by a short-lived session ID,
      // redirect with ?session_id=... — never expose the token in the URL.
      // For this Phase 4 mock, we pass a temp_token to enable page selection.
      const webUrl = process.env.WEB_URL || 'http://localhost:3000';
      return res.redirect(
        `${webUrl}/app/${oauthState.workspaceId}/settings/facebook-pages?connected=true&temp_token=${authData.accessToken}`
      );
    } catch (_e) {
      return res.status(400).send('FACEBOOK_OAUTH_CALLBACK_FAILED');
    }
  }
}

@Controller('workspaces/:workspaceId/facebook')
@UseGuards(MockAuthGuard, PermissionsGuard)
export class FacebookPagesController {
  private facebookProvider: FacebookPagesProvider;
  private encryptionService: SecretEncryptionService;

  constructor(
    private readonly db: DatabaseService,
    private readonly saasService: SaasService,
  ) {
    this.facebookProvider = process.env.META_PROVIDER === 'mock'
      ? new MockFacebookPagesProvider()
      : new GraphApiFacebookPagesProvider();
    this.encryptionService = new SecretEncryptionService();
  }

  /** Cast to `any` so IDE doesn't need to resolve Prisma generated types. Runtime is fine. */
  private get p(): any { return this.db; }

  @Get('available-pages')
  @RequirePermissions('facebook_connections.manage')
  async listAvailablePages(
    @Param('workspaceId') _workspaceId: string,
    @Query('temp_token') tempToken: string
  ) {
    if (!tempToken) throw new BadRequestException('temp_token is required');
    const pages = await this.facebookProvider.listManageablePages({ userAccessToken: tempToken });
    return { pages };
  }

  @Post('pages/connect')
  @RequirePermissions('facebook_connections.manage')
  async connectPage(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { pageId: string; pageName: string; category: string; grantedTasks: string[]; pageAccessToken: string },
    @Headers('x-user-id') userId: string
  ) {
    await this.saasService.assertActionAllowed(workspaceId, 'facebook.connect', userId || 'SYSTEM');

    // Check if already connected
    const existing = await this.p.facebookPageConnection.findUnique({
      where: { workspaceId_pageId: { workspaceId, pageId: body.pageId } }
    });
    if (existing) {
      throw new ConflictException('Page is already connected');
    }

    const tokenToEncrypt = body.pageAccessToken || 'mock_page_access_token_123';

    const encrypted = await this.encryptionService.encrypt({
      plaintext: tokenToEncrypt,
      associatedData: `${workspaceId}:${body.pageId}`
    });

    const connection = await this.p.facebookPageConnection.create({
      data: {
        workspaceId,
        pageId: body.pageId,
        pageName: body.pageName,
        pageCategory: body.category,
        status: 'ACTIVE',
        grantedTasksJson: body.grantedTasks,
        grantedScopesJson: ['pages_manage_posts'],
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
        tokenFingerprint: 'fingerprint_placeholder',
        connectedByUserId: userId || 'SYSTEM',
        lastValidatedAt: new Date(),
        lastValidationStatus: 'VALID'
      }
    });

    return {
      id: connection.id,
      pageId: connection.pageId,
      pageName: connection.pageName,
      status: connection.status
    };
  }

  @Get('pages')
  @RequirePermissions('facebook_connections.read')
  async listConnectedPages(@Param('workspaceId') workspaceId: string) {
    const pages = await this.p.facebookPageConnection.findMany({
      where: { workspaceId, deletedAt: null }
    });
    return pages.map((page: any) => ({
      id: page.id,
      pageId: page.pageId,
      pageName: page.pageName,
      category: page.pageCategory,
      status: page.status,
      grantedScopes: page.grantedScopesJson,
      lastValidatedAt: page.lastValidatedAt,
      requiresReauthorization: page.status === 'NEEDS_REAUTH'
    }));
  }

  @Delete('pages/:connectionId')
  @RequirePermissions('facebook_connections.manage')
  async deletePage(
    @Param('workspaceId') workspaceId: string,
    @Param('connectionId') connectionId: string
  ) {
    const conn = await this.p.facebookPageConnection.findFirst({
      where: { id: connectionId, workspaceId }
    });
    if (!conn) throw new BadRequestException('Connection not found');

    await this.p.facebookPageConnection.update({
      where: { id: connectionId },
      data: { deletedAt: new Date(), status: 'DISABLED' }
    });
    return { success: true };
  }
}
