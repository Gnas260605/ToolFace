import { Source, safeFetch, parseFeed } from '@newsflow/database';
import { SourceAdapter, RawArticleData } from './source-adapter.interface';

export class RssAdapter implements SourceAdapter {
  async fetch(source: Source): Promise<RawArticleData[]> {
    const res = await safeFetch(source.feedUrl, {
      allowHttpInDev: true,
      maxBytes: 5 * 1024 * 1024,
    });

    const parsed = parseFeed(res.body, source.feedUrl);

    return parsed.entries.map((entry) => ({
      title: entry.title,
      summary: entry.summary || '',
      author: entry.author || undefined,
      originalUrl: entry.originalUrl,
      canonicalUrl: entry.canonicalUrl,
      publishedAt: entry.publishedAt || new Date(),
      imageUrl: entry.imageUrl || undefined,
      categories: entry.categories || [],
      rawMetadata: (entry.rawMetadata || {}) as Record<string, unknown>,
    }));
  }
}
