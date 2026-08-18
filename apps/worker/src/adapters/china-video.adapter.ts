import { Source, safeFetch, parseFeed } from '@newsflow/database';
import { SourceAdapter, RawArticleData } from './source-adapter.interface';

export class ChinaVideoAdapter implements SourceAdapter {
  canHandle(source: Source): boolean {
    const url = source.feedUrl.toLowerCase();
    const domain = source.domain.toLowerCase();
    return (
      url.includes('douyin') ||
      url.includes('kuaishou') ||
      url.includes('weibo') ||
      url.includes('bilibili') ||
      domain.includes('douyin.com') ||
      domain.includes('weibo.com') ||
      domain.includes('bilibili.com') ||
      source.category.includes('china')
    );
  }

  async fetch(source: Source): Promise<RawArticleData[]> {
    const url = source.feedUrl.toLowerCase();
    const isRssUrl =
      source.sourceType === 'OFFICIAL_RSS' ||
      url.includes('/rss') ||
      url.includes('.rss') ||
      url.includes('.xml') ||
      url.includes('/feed');

    if (isRssUrl) {
      return this.fetchFromRss(source);
    }

    return this.fetchFromDirectUrl(source);
  }

  private async fetchFromRss(source: Source): Promise<RawArticleData[]> {
    const res = await safeFetch(source.feedUrl, {
      allowHttpInDev: true,
      maxBytes: 10 * 1024 * 1024,
    });

    const parsed = parseFeed(res.body, source.feedUrl);

    return parsed.entries.map((entry) => {
      const description = entry.summary || '';
      const mediaMatch = /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|webm|mov))/i.exec(description) ||
                         /<video[^>]+src=["']([^"']+)["']/i.exec(description);

      const videoUrl = mediaMatch ? mediaMatch[1] : undefined;

      return {
        title: entry.title || 'Video Reel Trung Quốc',
        summary: description.slice(0, 500),
        author: entry.author || source.attributionName || 'China Video Creator',
        publishedAt: entry.publishedAt || new Date(),
        originalUrl: entry.originalUrl,
        canonicalUrl: entry.canonicalUrl,
        imageUrl: entry.imageUrl || undefined,
        categories: [source.category || 'china_viral', 'reels', 'video'],
        rawMetadata: {
          platform: this.detectPlatform(entry.originalUrl),
          videoUrl,
          isReel: true,
          originalLanguage: 'zh',
          sourceType: 'china_video',
          ...(entry.rawMetadata || {}),
        },
      };
    });
  }

  private async fetchFromDirectUrl(source: Source): Promise<RawArticleData[]> {
    return [
      {
        title: source.name || 'Video Reel Trung Quốc',
        summary: `Video thịnh hành được trích xuất từ ${source.feedUrl}`,
        author: source.attributionName || 'China Creator',
        publishedAt: new Date(),
        originalUrl: source.feedUrl,
        canonicalUrl: source.feedUrl,
        categories: [source.category || 'china_viral', 'reels'],
        rawMetadata: {
          platform: this.detectPlatform(source.feedUrl),
          isReel: true,
          originalLanguage: 'zh',
          sourceType: 'china_video',
        },
      },
    ];
  }

  private detectPlatform(url: string): 'douyin' | 'kuaishou' | 'weibo' | 'bilibili' | 'unknown' {
    if (url.includes('douyin')) return 'douyin';
    if (url.includes('kuaishou')) return 'kuaishou';
    if (url.includes('weibo')) return 'weibo';
    if (url.includes('bilibili')) return 'bilibili';
    return 'unknown';
  }
}
