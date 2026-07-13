import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Web Landing Page Status tests', () => {
  beforeEach(() => {
    vi.stubGlobal('process', {
      env: {
        NEXT_PUBLIC_API_URL: 'http://localhost:3001',
      },
    });
  });

  it('fetch is called with correct URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ name: 'NewsFlow AI API', version: '0.1.0', environment: 'test' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: Home } = await import('./page');
    expect(Home).toBeDefined();

    const res = await fetch('http://localhost:3001/api/v1/system/info');
    const data = await res.json();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/api/v1/system/info');
    expect(data.name).toBe('NewsFlow AI API');
  });
});
