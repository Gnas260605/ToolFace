import { Source, safeFetch } from '@newsflow/database';
import { SourceAdapter, RawArticleData } from './source-adapter.interface';
import { XMLParser } from 'fast-xml-parser';

export class YouTubeAdapter implements SourceAdapter {
  async fetch(source: Source): Promise<RawArticleData[]> {
    const key = process.env.GOOGLE_DEVELOPER_KEY;
    const isRssUrl = source.feedUrl.includes('youtube.com/feeds/videos.xml');

    if (isRssUrl) {
      return this.fetchFromRss(source.feedUrl, source.category);
    }

    if (key) {
      try {
        if (source.feedUrl.startsWith('UC') && source.feedUrl.length >= 24) {
          return await this.fetchFromApiChannel(source.feedUrl, key, source.category);
        } else {
          return await this.fetchFromApiSearch(source.feedUrl, key, source.category);
        }
      } catch (err) {
        throw new Error(`YOUTUBE_API_FAILED: ${(err as Error).message}`);
      }
    }

    if (source.feedUrl.startsWith('UC') && source.feedUrl.length >= 24) {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.feedUrl}`;
      return this.fetchFromRss(rssUrl, source.category);
    }

    throw new Error('YOUTUBE_KEY_MISSING_AND_NOT_RSS');
  }

  private async fetchFromRss(rssUrl: string, category: string): Promise<RawArticleData[]> {
    const res = await safeFetch(rssUrl, {
      allowHttpInDev: true,
      maxBytes: 5 * 1024 * 1024,
    });

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      parseAttributeValue: false,
      parseTagValue: false,
    });

    const parsed = parser.parse(res.body);
    const feed = parsed.feed || {};
    const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return entries.map((entry: any) => {
      const title = entry.title || '';
      const originalUrl = entry.link?.['@_href'] || '';
      const videoId = entry['yt:videoId'] || '';
      const summary = entry['media:group']?.['media:description'] || '';
      const imageUrl = entry['media:group']?.['media:thumbnail']?.['@_url'] || '';
      const publishedAt = entry.published ? new Date(entry.published) : new Date();

      return {
        title,
        summary,
        author: entry.author?.name || 'YouTube Video',
        originalUrl,
        canonicalUrl: originalUrl || `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
        imageUrl,
        categories: [category || 'youtube'],
        rawMetadata: {
          videoId,
          channelId: entry['yt:channelId'] || '',
        },
      };
    });
  }

  private async fetchFromApiChannel(channelId: string, apiKey: string, category: string): Promise<RawArticleData[]> {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=10&type=video&key=${apiKey}`;
    const res = await safeFetch(url, { allowHttpInDev: true });
    const data = JSON.parse(res.body);

    const items = data.items || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.map((item: any) => {
      const snippet = item.snippet || {};
      const videoId = item.id?.videoId || '';
      const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt) : new Date();

      return {
        title: snippet.title || '',
        summary: snippet.description || '',
        author: snippet.channelTitle || 'YouTube Channel',
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
        imageUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
        categories: [category || 'youtube'],
        rawMetadata: {
          videoId,
          channelId: snippet.channelId,
        },
      };
    });
  }

  private async fetchFromApiSearch(query: string, apiKey: string, category: string): Promise<RawArticleData[]> {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&maxResults=10&type=video&key=${apiKey}`;
    const res = await safeFetch(url, { allowHttpInDev: true });
    const data = JSON.parse(res.body);

    const items = data.items || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.map((item: any) => {
      const snippet = item.snippet || {};
      const videoId = item.id?.videoId || '';
      const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt) : new Date();

      return {
        title: snippet.title || '',
        summary: snippet.description || '',
        author: snippet.channelTitle || 'YouTube Video Search',
        originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
        imageUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
        categories: [category || 'youtube'],
        rawMetadata: {
          videoId,
          channelId: snippet.channelId,
        },
      };
    });
  }
}
