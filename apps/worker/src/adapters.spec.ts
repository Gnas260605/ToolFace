import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Source, safeFetch } from '@newsflow/database';
import {
  RssAdapter,
  GoogleTrendsAdapter,
  RedditAdapter,
  YouTubeAdapter,
  ScraperAdapter,
} from './adapters';

vi.mock('@newsflow/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@newsflow/database')>();
  return {
    ...original,
    safeFetch: vi.fn(),
  };
});

describe('Ingestion Adapters Tests', () => {
  let mockSource: Source;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSource = {
      id: 'source-1',
      workspaceId: 'ws-1',
      name: 'Test Source',
      domain: 'test.com',
      feedUrl: 'https://test.com/feed',
      sourceType: 'OFFICIAL_RSS',
      language: 'vi',
      country: 'VN',
      category: 'sports',
      trustLevel: 'MEDIUM',
      pollIntervalSeconds: 900,
      allowPageExtraction: false,
      attributionName: 'Test',
      licenseNotes: null,
      status: 'ACTIVE',
      healthStatus: 'HEALTHY',
      lastPolledAt: null,
      lastSuccessAt: null,
      nextPollAt: new Date(),
      etag: null,
      lastModified: null,
      consecutiveFailures: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
  });

  describe('RssAdapter', () => {
    it('should successfully fetch and parse RSS feeds', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0">
        <channel>
          <title>Test RSS</title>
          <description>Test Desc</description>
          <link>https://test.com</link>
          <item>
            <title>Test Article</title>
            <description>This is a test article.</description>
            <link>https://test.com/article1</link>
            <pubDate>Thu, 16 Jul 2026 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;

      vi.mocked(safeFetch).mockResolvedValue({
        status: 200,
        headers: {},
        body: mockXml,
      });

      const adapter = new RssAdapter();
      const articles = await adapter.fetch(mockSource);

      expect(safeFetch).toHaveBeenCalledWith(mockSource.feedUrl, expect.any(Object));
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Test Article');
      expect(articles[0].originalUrl).toBe('https://test.com/article1');
      expect(articles[0].categories).toEqual([]);
    });
  });

  describe('GoogleTrendsAdapter', () => {
    it('should parse Google Trends daily searches RSS format', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0" xmlns:ht="https://trends.google.com/trends/trendingsearches/daily">
        <channel>
          <item>
            <title>Football Trend</title>
            <ht:approx_traffic>5,000+</ht:approx_traffic>
            <ht:news_item>
              <ht:news_item_title>Match Recap: Chelsea vs Arsenal</ht:news_item_title>
              <ht:news_item_snippet>An exciting London derby match summary.</ht:news_item_snippet>
              <ht:news_item_url>https://news.com/chelsea-arsenal</ht:news_item_url>
              <ht:news_item_source>News Source</ht:news_item_source>
            </ht:news_item>
          </item>
        </channel>
      </rss>`;

      mockSource.feedUrl = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=VN';
      vi.mocked(safeFetch).mockResolvedValue({
        status: 200,
        headers: {},
        body: mockXml,
      });

      const adapter = new GoogleTrendsAdapter();
      const articles = await adapter.fetch(mockSource);

      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Match Recap: Chelsea vs Arsenal');
      expect(articles[0].originalUrl).toBe('https://news.com/chelsea-arsenal');
      expect(articles[0].author).toBe('News Source');
      expect(articles[0].rawMetadata).toEqual({
        searchTerm: 'Football Trend',
        traffic: '5,000+',
        approxTraffic: 5000,
        sourceName: 'News Source',
      });
    });
  });

  describe('RedditAdapter', () => {
    it('should query new.json Reddit feed and map posts', async () => {
      const mockJson = JSON.stringify({
        data: {
          children: [
            {
              data: {
                title: 'Reddit Transfer News',
                selftext: 'Rumor has it that Mbappe is transferring.',
                url: 'https://reddit.com/r/soccer/comments/123/mbappe',
                permalink: '/r/soccer/comments/123/mbappe',
                author: 'reporter1',
                created_utc: 1784203200,
                thumbnail: 'self',
                subreddit: 'soccer',
                score: 450,
                num_comments: 89,
                id: '123',
              },
            },
          ],
        },
      });

      mockSource.feedUrl = 'r/soccer';
      vi.mocked(safeFetch).mockResolvedValue({
        status: 200,
        headers: {},
        body: mockJson,
      });

      const adapter = new RedditAdapter();
      const articles = await adapter.fetch(mockSource);

      expect(safeFetch).toHaveBeenCalledWith('https://www.reddit.com/r/soccer/new.json', expect.any(Object));
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Reddit Transfer News');
      expect(articles[0].author).toBe('u/reporter1');
      expect(articles[0].rawMetadata).toEqual({
        subreddit: 'soccer',
        score: 450,
        numComments: 89,
        id: '123',
      });
    });
  });

  describe('YouTubeAdapter', () => {
    it('should parse channel feed RSS successfully', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <entry>
          <id>yt:video:vid123</id>
          <yt:videoId>vid123</yt:videoId>
          <yt:channelId>UC12345</yt:channelId>
          <title>YouTube Match Review</title>
          <link rel="alternate" href="https://www.youtube.com/watch?v=vid123"/>
          <author>
            <name>Soccer Channel</name>
          </author>
          <published>2026-07-16T12:00:00.000Z</published>
          <media:group xmlns:media="http://search.yahoo.com/mrss/">
            <media:description>Review of the chelsea game.</media:description>
            <media:thumbnail url="https://i.ytimg.com/vi/vid123/hqdefault.jpg" width="480" height="360"/>
          </media:group>
        </entry>
      </feed>`;

      mockSource.feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC12345';
      vi.mocked(safeFetch).mockResolvedValue({
        status: 200,
        headers: {},
        body: mockXml,
      });

      const adapter = new YouTubeAdapter();
      const articles = await adapter.fetch(mockSource);

      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('YouTube Match Review');
      expect(articles[0].canonicalUrl).toBe('https://www.youtube.com/watch?v=vid123');
      expect(articles[0].imageUrl).toBe('https://i.ytimg.com/vi/vid123/hqdefault.jpg');
    });
  });

  describe('ScraperAdapter', () => {
    it('should parse HTML and find long links with image thumbnails', async () => {
      const mockHtml = `
      <html>
        <body>
          <div>
            <a href="/news/world-cup-recap">
              <img src="/images/cup.jpg" alt="cup"/>
              World Cup Final Match Highlights And Report
            </a>
            <a href="/about-us">About</a>
          </div>
        </body>
      </html>`;

      mockSource.feedUrl = 'https://sportsnews.com';
      mockSource.sourceType = 'APPROVED_WEB_PAGE';
      vi.mocked(safeFetch).mockResolvedValue({
        status: 200,
        headers: {},
        body: mockHtml,
      });

      const adapter = new ScraperAdapter();
      const articles = await adapter.fetch(mockSource);

      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('World Cup Final Match Highlights And Report');
      expect(articles[0].originalUrl).toBe('https://sportsnews.com/news/world-cup-recap');
      expect(articles[0].imageUrl).toBe('https://sportsnews.com/images/cup.jpg');
    });
  });
});
