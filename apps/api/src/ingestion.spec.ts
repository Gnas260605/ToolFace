import { describe, it, expect } from 'vitest';
import {
  isPrivateIp,
  normalizeUrl,
  normalizeTitle,
  calculateHash,
  parseFeed,
  getTokens,
  calculateJaccardSimilarity,
} from '@newsflow/database';

describe('Ingestion Engine - Security & SSRF Protection (Unit)', () => {
  it('should block loopback and local IPv4 addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('127.0.0.2')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
  });

  it('should block private IPv4 addresses (Class A, B, C)', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.5.10')).toBe(true);
    expect(isPrivateIp('192.168.1.25')).toBe(true);
  });

  it('should block link-local and cloud metadata addresses', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('169.254.10.20')).toBe(true);
  });

  it('should block loopback and unique-local IPv6 addresses', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('should allow valid public IP addresses', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('207.97.227.239')).toBe(false);
  });
});

describe('Ingestion Engine - URL & Title Normalization (Unit)', () => {
  it('should normalize URLs consistently and strip tracking parameters', () => {
    const rawUrl = 'HTTPS://www.Example.COM:443/Path/To/Page/?utm_source=fb&fbclid=123&gclid=abc&q=test#hash';
    expect(normalizeUrl(rawUrl)).toBe('https://www.example.com/Path/To/Page?q=test');
  });

  it('should normalize and collapse title strings', () => {
    const rawTitle = '  Giải Ngoại   Hạng Anh: MU 2-1 Man City!  ';
    expect(normalizeTitle(rawTitle)).toBe('giải ngoại hạng anh mu 2-1 man city');
  });

  it('should compute deterministic SHA-256 hashes', () => {
    const content1 = 'Đây là nội dung thử nghiệm';
    const content2 = 'Đây là nội dung thử nghiệm ';
    expect(calculateHash(content1)).toBe(calculateHash(content2));
    expect(calculateHash(content1)).toHaveLength(64);
  });
});

describe('Ingestion Engine - RSS/Atom Feed Parsing (Unit)', () => {
  const mockRss2 = `
    <rss version="2.0">
      <channel>
        <title>Bóng Đá 24h</title>
        <description>Tin bóng đá mới nhất</description>
        <link>https://bongda24h.vn</link>
        <item>
          <title>Tin bóng đá MU hôm nay</title>
          <link>https://bongda24h.vn/mu-hom-nay</link>
          <description>Tóm tắt tin tức CLB MU</description>
          <pubDate>Sun, 12 Jul 2026 13:00:00 GMT</pubDate>
          <guid>mu-123</guid>
        </item>
      </channel>
    </rss>
  `;

  it('should parse RSS 2.0 feed structure correctly', () => {
    const parsed = parseFeed(mockRss2, 'https://bongda24h.vn/rss.xml');
    expect(parsed.feedType).toBe('RSS_2_0');
    expect(parsed.title).toBe('Bóng Đá 24h');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].title).toBe('Tin bóng đá MU hôm nay');
    expect(parsed.entries[0].originalUrl).toBe('https://bongda24h.vn/mu-hom-nay');
  });

  it('should reject malformed XML structure', () => {
    const malformed = `<rss><channel><title>VnExpress`;
    expect(() => parseFeed(malformed, 'https://vnexpress.net/rss.xml')).toThrow('SOURCE_INVALID_FEED');
  });
});

describe('Ingestion Engine - Jaccard Title Similarity (Unit)', () => {
  it('should compute similarity scores between title tokens', () => {
    const titleA = getTokens('giải ngoại hạng anh mu vs chelsea');
    const titleB = getTokens('kết quả bóng đá ngoại hạng anh chelsea vs mu');
    const similarity = calculateJaccardSimilarity(titleA, titleB);

    // Common tokens: 'ngoại', 'hạng', 'anh', 'mu', 'chelsea' (5 tokens)
    // Total unique union tokens: 'giải', 'vs', 'kết', 'quả', 'bóng', 'đá' + 5 common (11 tokens)
    expect(similarity).toBeGreaterThan(0.4);
    expect(similarity).toBeLessThan(0.6);
  });

  it('should keep completely unrelated stories separate', () => {
    const titleA = getTokens('hội nghị kinh tế thế giới diễn ra tại thụy sĩ');
    const titleB = getTokens('cầu thủ bóng đá ronaldo lập cú đúp lịch sử');
    const similarity = calculateJaccardSimilarity(titleA, titleB);
    expect(similarity).toBe(0);
  });
});
