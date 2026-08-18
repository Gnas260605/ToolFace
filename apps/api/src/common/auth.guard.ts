import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionTokenService } from '@newsflow/database';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
export const SYSTEM_ADMIN_ROLE = 'SYSTEM_ADMIN';

export interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: string;
    workspaceId: string;
    systemRole?: string;
  };
  params: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private sessionTokenService: SessionTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers['authorization'] as string;
    
    // Fallback for local development if no JWT is provided
    if ((!authHeader || !authHeader.startsWith('Bearer ')) && process.env.NODE_ENV !== 'production') {
      const workspaceId = request.params.workspaceId || (request.headers['x-workspace-id'] as string) || 'system';
      request.user = {
        id: (request.headers['x-user-id'] as string) || 'mock-default-user-id',
        role: ((request.headers['x-user-role'] as string) || 'OWNER').toUpperCase(),
        workspaceId,
        systemRole: ((request.headers['x-system-role'] as string) || '').toUpperCase(),
      };
      return true;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.split(' ')[1];
    const payload = this.sessionTokenService.verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.user = {
      id: payload.userId,
      role: payload.role,
      workspaceId: payload.workspaceId,
      systemRole: payload.systemRole,
    };
    return true;
  }
}

@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_MOCK_AUTH !== 'true') {
      throw new ForbiddenException('MockAuthGuard is disabled outside development');
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    
    // Extract workspace ID from route parameters
    const workspaceId = request.params.workspaceId || (request.headers['x-workspace-id'] as string) || 'system';

    // Read headers for testing/overrides, fallback to defaults
    const userId = (request.headers['x-user-id'] as string) || 'mock-default-user-id';
    const role = (request.headers['x-user-role'] as string) || 'OWNER'; // default to OWNER for local dev ease
    const systemRole = (request.headers['x-system-role'] as string) || '';

    request.user = {
      id: userId,
      role: role.toUpperCase(),
      workspaceId,
      systemRole: systemRole.toUpperCase(),
    };

    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const routeWorkspaceId = request.params.workspaceId;
    if (routeWorkspaceId && user.workspaceId !== routeWorkspaceId && user.systemRole !== SYSTEM_ADMIN_ROLE) {
      throw new ForbiddenException('User does not belong to this workspace');
    }

    // Role Permissions mapping
    const hasPermission = requiredPermissions.every((permission) => {
      if (
        permission.startsWith('admin.') ||
        permission.startsWith('system_settings.') ||
        permission.startsWith('plans.') ||
        permission.startsWith('feature_flags.')
      ) {
        return user.systemRole === SYSTEM_ADMIN_ROLE;
      }
      if (permission === 'billing.read' || permission === 'billing.manage' || permission === 'usage.read') {
        if (permission === 'billing.manage') {
          return ['OWNER'].includes(user.role);
        }
        return ['OWNER', 'ADMIN'].includes(user.role);
      }
      if (permission === 'workspace_settings.read') {
        return ['OWNER', 'ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role);
      }
      if (permission === 'workspace_settings.manage' || permission === 'white_label.manage') {
        return ['OWNER', 'ADMIN'].includes(user.role);
      }
      if (permission === 'white_label.read') {
        return ['OWNER', 'ADMIN', 'EDITOR', 'REVIEWER'].includes(user.role);
      }
      if (
        permission === 'sources.read' ||
        permission === 'articles.read' ||
        permission === 'brand_profiles.read' ||
        permission === 'drafts.read' ||
        permission === 'ai.usage.read' ||
        permission === 'calendar.read' ||
        permission === 'publishing.read' ||
        permission === 'notifications.read' ||
        permission === 'facebook_connections.read'
      ) {
        return ['OWNER', 'ADMIN', 'EDITOR', 'REVIEWER', 'VIEWER'].includes(user.role);
      }
      if (
        permission === 'sources.manage' ||
        permission === 'brand_profiles.manage' ||
        permission === 'notifications.manage_preferences'
      ) {
        return ['OWNER', 'ADMIN'].includes(user.role);
      }
      if (
        permission === 'drafts.create' ||
        permission === 'drafts.edit' ||
        permission === 'ai.generate' ||
        permission === 'publishing.schedule' ||
        permission === 'publishing.reschedule' ||
        permission === 'publishing.cancel' ||
        permission === 'drafts.publish' ||
        permission === 'facebook_connections.manage'
      ) {
        return ['OWNER', 'ADMIN', 'EDITOR'].includes(user.role);
      }
      if (permission === 'drafts.review' || permission === 'drafts.approve') {
        return ['OWNER', 'ADMIN', 'REVIEWER'].includes(user.role);
      }
      return false;
    });

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }

    return true;
  }
}
