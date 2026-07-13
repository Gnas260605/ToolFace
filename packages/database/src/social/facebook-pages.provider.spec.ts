import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  MockFacebookPagesProvider, 
  GraphApiFacebookPagesProvider 
} from './facebook-pages.provider';

describe('FacebookPagesProvider', () => {
  describe('MockFacebookPagesProvider', () => {
    const provider = new MockFacebookPagesProvider();

    it('should build auth URL', async () => {
      const url = await provider.buildAuthorizationUrl({ redirectUri: 'http://loc', state: 'xyz' });
      expect(url).toContain('code=mock_code');
    });

    it('should exchange code', async () => {
      const result = await provider.exchangeAuthorizationCode({ code: 'valid', redirectUri: 'http://loc' });
      expect(result.accessToken).toBe('mock_user_access_token');
    });

    it('should fail exchange with invalid code', async () => {
      await expect(
        provider.exchangeAuthorizationCode({ code: 'invalid_code', redirectUri: 'http://loc' })
      ).rejects.toThrow('Mock: Invalid authorization code');
    });

    it('should list manageable pages', async () => {
      const pages = await provider.listManageablePages({ userAccessToken: 'mock_user_access_token' });
      expect(pages).toHaveLength(2);
      expect(pages[0].pageName).toBe('Bóng Đá Hôm Nay (Mock)');
    });

    it('should validate page connection', async () => {
      const valid = await provider.validatePageConnection({ pageAccessToken: 'mock_token', pageId: '1' });
      expect(valid.isValid).toBe(true);

      const expired = await provider.validatePageConnection({ pageAccessToken: 'mock_token_expired', pageId: '1' });
      expect(expired.isValid).toBe(false);
      expect(expired.requiresReauthorization).toBe(true);
    });

    it('should publish successfully', async () => {
      const res = await provider.publishTextPost({ pageAccessToken: 'mock_token', pageId: '1', message: 'Hello' });
      expect(res.success).toBe(true);
      expect(res.facebookPostId).toBeDefined();
    });

    it('should handle publish failures', async () => {
      const res = await provider.publishTextPost({ pageAccessToken: 'mock_token_rate_limited', pageId: '1', message: 'Hello' });
      expect(res.success).toBe(false);
      expect(res.errorCategory).toBe('RATE_LIMIT');
    });
  });

  describe('GraphApiFacebookPagesProvider with fetch mocks', () => {
    let provider: GraphApiFacebookPagesProvider;
    
    beforeEach(() => {
      provider = new GraphApiFacebookPagesProvider();
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should build authorization URL correctly', async () => {
      const url = await provider.buildAuthorizationUrl({ redirectUri: 'http://loc', state: 'xyz' });
      expect(url).toContain('oauth');
    });

    it('should exchange authorization code successfully', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'user_token', expires_in: 3600 }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'user_id_123' }),
        } as Response);

      const result = await provider.exchangeAuthorizationCode({ code: 'code123', redirectUri: 'http://loc' });
      expect(result.accessToken).toBe('user_token');
      expect(result.userId).toBe('user_id_123');
    });

    it('should throw an error on oauth failure', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid code' } }),
      } as Response);

      await expect(
        provider.exchangeAuthorizationCode({ code: 'bad', redirectUri: 'http://loc' })
      ).rejects.toThrow('Facebook OAuth token exchange failed: Invalid code');
    });

    it('should list manageable pages correctly', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'p1', name: 'Page 1', category: 'General', tasks: ['CREATE_CONTENT'], access_token: 'pat1' }
          ]
        }),
      } as Response);

      const pages = await provider.listManageablePages({ userAccessToken: 'tok' });
      expect(pages).toHaveLength(1);
      expect(pages[0].pageId).toBe('p1');
      expect(pages[0].canPublish).toBe(true);
      expect(pages[0].pageAccessToken).toBe('pat1');
    });

    it('should validate page connection status', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 190, message: 'Expired' } }),
      } as Response);

      const status = await provider.validatePageConnection({ pageAccessToken: 'tok', pageId: 'id' });
      expect(status.isValid).toBe(false);
      expect(status.requiresReauthorization).toBe(true);
      expect(status.errorCode).toBe('190');
    });

    it('should publish post and parse result', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'post_123' }),
      } as Response);

      const res = await provider.publishTextPost({ pageAccessToken: 'pat', pageId: 'pid', message: 'hello' });
      expect(res.success).toBe(true);
      expect(res.facebookPostId).toBe('post_123');
    });
  });
});
