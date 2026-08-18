import { Source, safeFetch } from '@newsflow/database';
import { SourceAdapter, RawArticleData } from './source-adapter.interface';
import { XMLParser } from 'fast-xml-parser';

function parseTrafficNumber(trafficStr: string): number {
  if (!trafficStr) return 0;
  const clean = trafficStr.replace(/[^0-9kmKM.+]/g, '').trim().toUpperCase();
  if (clean.includes('M')) {
    return (parseFloat(clean.replace('M', '').replace('+', '')) || 1) * 1000000;
  }
  if (clean.includes('K')) {
    return (parseFloat(clean.replace('K', '').replace('+', '')) || 1) * 1000;
  }
  return parseFloat(clean.replace('+', '')) || 0;
}

export class GoogleTrendsAdapter implements SourceAdapter {
  async fetch(source: Source): Promise<RawArticleData[]> {
    const url = source.feedUrl || 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=VN';
    
    const res = await safeFetch(url, {
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
    const channel = parsed.rss?.channel || {};
    const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];

    const articles: RawArticleData[] = [];

    for (const item of items) {
      const searchTerm = item.title;
      const traffic = item['ht:approx_traffic'] || '';
      const approxTraffic = parseTrafficNumber(traffic);
      
      const newsItemsRaw = item['ht:news_item'] 
        ? (Array.isArray(item['ht:news_item']) ? item['ht:news_item'] : [item['ht:news_item']]) 
        : [];

      for (const news of newsItemsRaw) {
        const title = news['ht:news_item_title'] || searchTerm;
        const originalUrl = news['ht:news_item_url'] || '';
        const summary = news['ht:news_item_snippet'] || '';
        const sourceName = news['ht:news_item_source'] || '';

        if (!originalUrl) continue;

        articles.push({
          title,
          summary,
          author: sourceName || 'Google Trends',
          originalUrl,
          canonicalUrl: originalUrl,
          publishedAt: new Date(),
          categories: [source.category || 'trends'],
          rawMetadata: {
            searchTerm,
            traffic,
            approxTraffic,
            sourceName,
          },
        });
      }
    }

    return articles;
  }
}
