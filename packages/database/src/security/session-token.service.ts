import jwt from 'jsonwebtoken';
import { getServerEnv } from '@newsflow/config';

export interface TokenPayload {
  userId: string;
  workspaceId: string;
  role: string;
  systemRole: string;
}

export class SessionTokenService {
  /**
   * Ký JWT access token
   * workspaceId trong token là workspace mà user đăng nhập lần gần nhất chọn.
   * Với các API multi-workspace, vẫn phải kiểm tra user có phải thành viên của workspace đó không.
   * Token KHÔNG phải là nguồn chân lý duy nhất cho quyền truy cập workspace.
   */
  signAccessToken(payload: TokenPayload): string {
    const env = getServerEnv();
    return jwt.sign(
      {
        sub: payload.userId,
        workspaceId: payload.workspaceId,
        role: payload.role,
        systemRole: payload.systemRole,
      },
      env.JWT_ACCESS_SECRET,
      {
        expiresIn: env.JWT_ACCESS_TTL_SECONDS,
        algorithm: 'HS256',
      }
    );
  }

  /**
   * Xác minh JWT access token
   */
  verifyAccessToken(token: string): TokenPayload | null {
    try {
      const env = getServerEnv();
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
      }) as any;

      return {
        userId: decoded.sub,
        workspaceId: decoded.workspaceId,
        role: decoded.role,
        systemRole: decoded.systemRole,
      };
    } catch (error) {
      // return null if invalid or expired
      return null;
    }
  }

  /**
   * Ký JWT refresh token
   */
  signRefreshToken(userId: string): string {
    const env = getServerEnv();
    return jwt.sign(
      { sub: userId },
      env.JWT_REFRESH_SECRET,
      {
        expiresIn: env.JWT_REFRESH_TTL_SECONDS,
        algorithm: 'HS256',
      }
    );
  }

  /**
   * Xác minh JWT refresh token
   */
  verifyRefreshToken(token: string): { userId: string } | null {
    try {
      const env = getServerEnv();
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
        algorithms: ['HS256'],
      }) as any;

      return {
        userId: decoded.sub,
      };
    } catch (error) {
      return null;
    }
  }
}
