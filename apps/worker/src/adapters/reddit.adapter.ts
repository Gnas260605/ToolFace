import { Source, safeFetch } from '@newsflow/database';
import { SourceAdapter, RawArticleData } from './source-adapter.interface';

export class RedditAdapter implements SourceAdapter {
  async fetch(source: Source): Promise<RawArticleData[]> {
    let url = source.feedUrl;

    if (!url.endsWith('.json')) {
      if (url.startsWith('r/')) {
        url = `https://www.reddit.com/${url}/new.json`;
      } else {
        url = url.replace(/\/$/, '') + '/new.json';
      }
    }

    const res = await safeFetch(url, {
      allowHttpInDev: true,
      userAgent: 'NewsFlowAI/0.1.0 Ingestion Engine (Reddit adapter)',
    });

    const parsed = JSON.parse(res.body);
    const children = parsed.data?.children || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return children.map((child: any) => {
      const post = child.data || {};
      const title = post.title || '';
      const summary = post.selftext || '';
      const originalUrl = post.url || `https://www.reddit.com${post.permalink}`;
      const canonicalUrl = `https://www.reddit.com${post.permalink}`;
      const publishedAt = post.created_utc ? new Date(post.created_utc * 1000) : new Date();
      const imageUrl = (post.thumbnail && post.thumbnail.startsWith('http')) ? post.thumbnail : undefined;

      return {
        title,
        summary,
        author: `u/${post.author}` || 'reddit',
        originalUrl,
        canonicalUrl,
        publishedAt,
        imageUrl,
        categories: [source.category || 'reddit'],
        rawMetadata: {
          subreddit: post.subreddit,
          score: post.score,
          numComments: post.num_comments,
          id: post.id,
        },
      };
    });
  }
}
