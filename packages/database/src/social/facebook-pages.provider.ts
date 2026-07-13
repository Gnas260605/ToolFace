export interface FacebookUserAuthorization {
  accessToken: string;
  expiresIn?: number;
  userId: string;
}

export interface ManageableFacebookPage {
  pageId: string;
  pageName: string;
  category: string;
  grantedTasks: string[];
  canPublish: boolean;
  pageAccessToken?: string;
}

export interface PageConnectionValidation {
  isValid: boolean;
  requiresReauthorization: boolean;
  missingPermissions: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface FacebookPublishResult {
  success: boolean;
  facebookPostId?: string;
  facebookPermalink?: string;
  errorCategory?: string;
  errorCode?: string;
  errorSubcode?: string;
  errorMessage?: string;
  sanitizedResponseJson?: unknown;
}

export interface BuildAuthorizationUrlInput {
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}

export interface ExchangeAuthorizationCodeInput {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface ListManageablePagesInput {
  userAccessToken: string;
}

export interface ValidatePageConnectionInput {
  pageAccessToken: string;
  pageId: string;
}

export interface PublishTextPostInput {
  pageAccessToken: string;
  pageId: string;
  message: string;
}

export interface PublishLinkPostInput {
  pageAccessToken: string;
  pageId: string;
  message: string;
  link: string;
}

export interface PublishPhotoPostInput {
  pageAccessToken: string;
  pageId: string;
  message: string;
  photoUrl: string;
}

export interface FacebookPagesProvider {
  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): Promise<string>;
  exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<FacebookUserAuthorization>;
  listManageablePages(input: ListManageablePagesInput): Promise<ManageableFacebookPage[]>;
  validatePageConnection(input: ValidatePageConnectionInput): Promise<PageConnectionValidation>;
  publishTextPost(input: PublishTextPostInput): Promise<FacebookPublishResult>;
  publishLinkPost(input: PublishLinkPostInput): Promise<FacebookPublishResult>;
  publishPhotoPost?(input: PublishPhotoPostInput): Promise<FacebookPublishResult>;
}

export class MockFacebookPagesProvider implements FacebookPagesProvider {
  private simulateDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  async buildAuthorizationUrl(input: BuildAuthorizationUrlInput): Promise<string> {
    return `${input.redirectUri}?code=mock_code&state=${input.state}`;
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<FacebookUserAuthorization> {
    await this.simulateDelay();
    if (input.code === 'invalid_code') {
      throw new Error('Mock: Invalid authorization code');
    }
    return {
      accessToken: 'mock_user_access_token',
      expiresIn: 3600,
      userId: 'mock_user_123',
    };
  }

  async listManageablePages(input: ListManageablePagesInput): Promise<ManageableFacebookPage[]> {
    await this.simulateDelay();
    if (input.userAccessToken !== 'mock_user_access_token') {
      throw new Error('Mock: Invalid user token');
    }
    return [
      {
        pageId: 'mock_page_id_1',
        pageName: 'Bóng Đá Hôm Nay (Mock)',
        category: 'Sports',
        grantedTasks: ['CREATE_CONTENT', 'MANAGE', 'ANALYZE'],
        canPublish: true,
      },
      {
        pageId: 'mock_page_id_readonly',
        pageName: 'Tin Tức Readonly (Mock)',
        category: 'News',
        grantedTasks: ['ANALYZE'],
        canPublish: false,
      },
    ];
  }

  async validatePageConnection(input: ValidatePageConnectionInput): Promise<PageConnectionValidation> {
    await this.simulateDelay();
    if (input.pageAccessToken === 'mock_token_expired') {
      return {
        isValid: false,
        requiresReauthorization: true,
        missingPermissions: [],
        errorCode: '190',
        errorMessage: 'Error validating access token: Session has expired',
      };
    }
    if (input.pageAccessToken === 'mock_token_no_permission') {
      return {
        isValid: false,
        requiresReauthorization: false,
        missingPermissions: ['CREATE_CONTENT'],
        errorCode: '200',
        errorMessage: 'Insufficient permission to post to page',
      };
    }
    
    // Default valid
    return {
      isValid: true,
      requiresReauthorization: false,
      missingPermissions: [],
    };
  }

  async publishTextPost(input: PublishTextPostInput): Promise<FacebookPublishResult> {
    await this.simulateDelay();
    return this.simulatePublish(input.pageAccessToken);
  }

  async publishLinkPost(input: PublishLinkPostInput): Promise<FacebookPublishResult> {
    await this.simulateDelay();
    return this.simulatePublish(input.pageAccessToken);
  }
  
  async publishPhotoPost(input: PublishPhotoPostInput): Promise<FacebookPublishResult> {
      await this.simulateDelay();
      return this.simulatePublish(input.pageAccessToken);
  }

  private simulatePublish(token: string): FacebookPublishResult {
    if (token === 'mock_token_expired') {
      return {
        success: false,
        errorCategory: 'AUTHENTICATION',
        errorCode: '190',
        errorMessage: 'Session has expired',
        sanitizedResponseJson: { error: { message: 'Session has expired', code: 190 } },
      };
    }
    if (token === 'mock_token_rate_limited') {
      return {
        success: false,
        errorCategory: 'RATE_LIMIT',
        errorCode: '4',
        errorMessage: 'Application request limit reached',
        sanitizedResponseJson: { error: { message: 'Application request limit reached', code: 4 } },
      };
    }
    if (token === 'mock_token_transient_error') {
      return {
        success: false,
        errorCategory: 'TRANSIENT',
        errorCode: '1',
        errorMessage: 'An unknown error occurred',
        sanitizedResponseJson: { error: { message: 'An unknown error occurred', code: 1 } },
      };
    }
    if (token === 'mock_token_timeout') {
      return {
        success: false,
        errorCategory: 'UNKNOWN', // ambiguous result
        errorMessage: 'Request to Meta timed out',
      };
    }
    
    // Success
    const fakeId = `1234567890_${Math.floor(Math.random() * 1000000)}`;
    return {
      success: true,
      facebookPostId: fakeId,
      facebookPermalink: `https://facebook.com/${fakeId}`,
      sanitizedResponseJson: { id: fakeId },
    };
  }
}

export class FacebookApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly errorSubcode?: number
  ) {
    super(message);
    this.name = 'FacebookApiError';
  }
}

interface FacebookTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface FacebookMeResponse {
  id: string;
}

interface FacebookPageItem {
  id: string;
  name: string;
  category: string;
  tasks: string[];
  access_token: string;
}

interface FacebookPagesResponse {
  data: FacebookPageItem[];
}

export class GraphApiFacebookPagesProvider implements FacebookPagesProvider {
  private apiVersion: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.apiVersion = process.env.META_GRAPH_API_VERSION || 'v20.0';
    this.clientId = process.env.META_APP_ID || '';
    this.clientSecret = process.env.META_APP_SECRET || '';
  }

  async buildAuthorizationUrl(input: BuildAuthorizationUrlInput): Promise<string> {
    const scopes = process.env.META_REQUIRED_SCOPES || 'pages_show_list,pages_manage_posts,pages_read_engagement';
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(input.redirectUri)}&state=${input.state}&scope=${encodeURIComponent(scopes)}`;
  }

  async exchangeAuthorizationCode(input: ExchangeAuthorizationCodeInput): Promise<FacebookUserAuthorization> {
    const url = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token` +
      `?client_id=${this.clientId}` +
      `&client_secret=${this.clientSecret}` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&code=${input.code}`;

    try {
      const data = await this.fetchJson<FacebookTokenResponse>(url);
      const meUrl = `https://graph.facebook.com/${this.apiVersion}/me?access_token=${data.access_token}`;
      const meData = await this.fetchJson<FacebookMeResponse>(meUrl);

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        userId: meData.id || 'unknown_user_id',
      };
    } catch (error) {
      throw new Error(`Facebook OAuth token exchange failed: ${(error as Error).message}`);
    }
  }

  async listManageablePages(input: ListManageablePagesInput): Promise<ManageableFacebookPage[]> {
    const url = `https://graph.facebook.com/${this.apiVersion}/me/accounts?fields=id,name,category,tasks,access_token&access_token=${input.userAccessToken}`;
    try {
      const data = await this.fetchJson<FacebookPagesResponse>(url);
      const pages = data.data || [];
      return pages.map((p) => {
        const grantedTasks = p.tasks || [];
        const canPublish = grantedTasks.includes('CREATE_CONTENT') || 
                           grantedTasks.includes('MANAGE') || 
                           grantedTasks.includes('PUBLISH_CONTENT');
        return {
          pageId: p.id,
          pageName: p.name,
          category: p.category || 'General',
          grantedTasks,
          canPublish,
          pageAccessToken: p.access_token,
        };
      });
    } catch (error) {
      throw new Error(`Failed to retrieve manageable Facebook pages: ${(error as Error).message}`);
    }
  }

  async validatePageConnection(input: ValidatePageConnectionInput): Promise<PageConnectionValidation> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${input.pageId}?fields=id,name&access_token=${input.pageAccessToken}`;
    try {
      await this.fetchJson<{ id: string; name: string }>(url);
      return {
        isValid: true,
        requiresReauthorization: false,
        missingPermissions: [],
      };
    } catch (error) {
      if (error instanceof FacebookApiError) {
        const isExpired = error.code === 190 || error.errorSubcode === 463 || error.errorSubcode === 467;
        return {
          isValid: false,
          requiresReauthorization: isExpired,
          missingPermissions: [],
          errorCode: error.code !== undefined ? String(error.code) : undefined,
          errorMessage: error.message || 'Verification failed',
        };
      }
      return {
        isValid: false,
        requiresReauthorization: false,
        missingPermissions: [],
        errorMessage: (error as Error).message || 'Verification failed',
      };
    }
  }

  async publishTextPost(input: PublishTextPostInput): Promise<FacebookPublishResult> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${input.pageId}/feed`;
    return this.executePublish(url, {
      message: input.message,
      access_token: input.pageAccessToken,
    });
  }

  async publishLinkPost(input: PublishLinkPostInput): Promise<FacebookPublishResult> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${input.pageId}/feed`;
    return this.executePublish(url, {
      message: input.message,
      link: input.link,
      access_token: input.pageAccessToken,
    });
  }

  async publishPhotoPost(input: PublishPhotoPostInput): Promise<FacebookPublishResult> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${input.pageId}/photos`;
    return this.executePublish(url, {
      caption: input.message,
      url: input.photoUrl,
      access_token: input.pageAccessToken,
    });
  }

  private async executePublish(url: string, body: Record<string, unknown>): Promise<FacebookPublishResult> {
    try {
      const data = await this.fetchJson<{ id: string; post_id?: string }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return {
        success: true,
        facebookPostId: data.id,
        facebookPermalink: `https://facebook.com/${data.id}`,
        sanitizedResponseJson: data,
      };
    } catch (error) {
      if (error instanceof FacebookApiError) {
        let category = 'UNKNOWN';
        if (error.code === 190) category = 'AUTHENTICATION';
        else if (error.code === 4 || error.code === 17) category = 'RATE_LIMIT';
        else if (error.code === 1 || error.code === 2) category = 'TRANSIENT';

        return {
          success: false,
          errorCategory: category,
          errorCode: error.code !== undefined ? String(error.code) : undefined,
          errorMessage: error.message || 'Meta publish failed',
          sanitizedResponseJson: { error: { message: error.message, code: error.code, error_subcode: error.errorSubcode } },
        };
      }
      return {
        success: false,
        errorCategory: 'UNKNOWN',
        errorMessage: (error as Error).message || 'Meta publish failed',
      };
    }
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        let errorMsg = `Fetch failed with status ${res.status}`;
        let code: number | undefined;
        let errorSubcode: number | undefined;
        try {
          const errData = await res.json() as { error?: { message?: string; code?: number; error_subcode?: number } };
          if (errData?.error) {
            errorMsg = errData.error.message || errorMsg;
            code = errData.error.code;
            errorSubcode = errData.error.error_subcode;
          }
        } catch {
          // ignore JSON parse error on non-ok status
        }
        throw new FacebookApiError(errorMsg, code, errorSubcode);
      }
      return await res.json() as T;
    } catch (error) {
      if (error instanceof FacebookApiError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new FacebookApiError(error.message);
      }
      throw new FacebookApiError(String(error));
    }
  }
}
