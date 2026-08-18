import { Source, safeFetch } from '@newsflow/database';
import { SourceAdapter, RawArticleData } from './source-adapter.interface';
import { JSDOM } from 'jsdom';

export class ScraperAdapter implements SourceAdapter {
  async fetch(source: Source): Promise<RawArticleData[]> {
    const res = await safeFetch(source.feedUrl, {
      allowHttpInDev: true,
      userAgent: 'NewsFlowAI/0.1.0 Ingestion Engine (Scraper adapter)',
    });

    const dom = new JSDOM(res.body, { url: source.feedUrl });
    const document = dom.window.document;
    const articles: RawArticleData[] = [];
    const anchors = Array.from(document.querySelectorAll('a'));
    const seenUrls = new Set<string>();

    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (!href) continue;

      let absoluteUrl: string;
      try {
        absoluteUrl = new dom.window.URL(href, source.feedUrl).href;
      } catch {
        continue;
      }

      if (!absoluteUrl.startsWith('http')) continue;
      if (absoluteUrl === source.feedUrl || absoluteUrl === source.feedUrl + '/') continue;
      if (seenUrls.has(absoluteUrl)) continue;

      const text = a.textContent?.trim() || '';
      if (text.length < 20 || text.split(/\s+/).length < 4) continue;

      seenUrls.add(absoluteUrl);

      let imageUrl: string | undefined = undefined;
      const img = a.querySelector('img') || a.parentElement?.querySelector('img');
      if (img) {
        const src = img.getAttribute('src');
        if (src) {
          try {
            imageUrl = new dom.window.URL(src, source.feedUrl).href;
          } catch {
            // Ignore invalid URLs
          }
        }
      }

      articles.push({
        title: text,
        summary: text,
        originalUrl: absoluteUrl,
        canonicalUrl: absoluteUrl,
        publishedAt: new Date(),
        categories: [source.category || 'scraped'],
        imageUrl,
      });

      if (articles.length >= 20) break;
    }

    return articles;
  }
}
