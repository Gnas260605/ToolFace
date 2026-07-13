/* eslint-disable @typescript-eslint/no-explicit-any */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { URL } from 'url';

export type NormalizedFeedEntry = {
  externalId?: string;
  title: string;
  summary?: string;
  author?: string;
  originalUrl: string;
  canonicalUrl: string;
  publishedAt?: Date;
  imageUrl?: string;
  categories: string[];
  rawMetadata: Record<string, unknown>;
};

export interface FeedParseResult {
  feedType: 'RSS_2_0' | 'RSS_1_0' | 'ATOM' | 'UNKNOWN';
  title: string;
  description: string;
  entries: NormalizedFeedEntry[];
}

function ensureArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function resolveUrl(link: string, baseUrl: string): string {
  try {
    return new URL(link, baseUrl).href;
  } catch {
    return link;
  }
}

function parsePubDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return undefined;
  return new Date(parsed);
}

function extractImage(item: any): string | undefined {
  if (item.enclosure) {
    const enc = ensureArray(item.enclosure)[0];
    if (enc?.['@_url']) {
      return enc['@_url'];
    }
  }
  if (item['media:content']) {
    const media = ensureArray(item['media:content'])[0];
    if (media?.['@_url']) {
      return media['@_url'];
    }
  }
  if (item['media:thumbnail']) {
    const thumb = ensureArray(item['media:thumbnail'])[0];
    if (thumb?.['@_url']) {
      return thumb['@_url'];
    }
  }
  return undefined;
}

function cleanText(text: any): string {
  if (!text) return '';
  if (typeof text === 'object') {
    if (text['#text']) return String(text['#text']).trim();
    return '';
  }
  return String(text).trim();
}

export function parseFeed(xmlContent: string, feedUrl: string, maxEntries = 50): FeedParseResult {
  const validation = XMLValidator.validate(xmlContent);
  if (validation !== true) {
    throw new Error('SOURCE_INVALID_FEED');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
  });

  const parsed = parser.parse(xmlContent);

  if (parsed.rss || parsed['rdf:RDF'] || parsed.feed) {
    if (parsed.rss) {
      // RSS 2.0
      const channel = parsed.rss.channel || {};
      const feedTitle = cleanText(channel.title) || 'Untitled Feed';
      const feedDesc = cleanText(channel.description || channel.subtitle) || '';
      const items = ensureArray(channel.item).slice(0, maxEntries);

      const entries: NormalizedFeedEntry[] = items.map((item: any) => {
        const link = cleanText(item.link || item.guid);
        const resolvedLink = resolveUrl(link, feedUrl);

        return {
          externalId: cleanText(item.guid || item.link),
          title: cleanText(item.title) || 'Untitled Article',
          summary: cleanText(item.description || item.summary),
          author: cleanText(item['dc:creator'] || item.author),
          originalUrl: resolvedLink,
          canonicalUrl: resolvedLink, // Initial value, normalized later
          publishedAt: parsePubDate(item.pubDate || item.date),
          imageUrl: extractImage(item),
          categories: ensureArray(item.category).map((c: any) => cleanText(c)).filter(Boolean),
          rawMetadata: item,
        };
      });

      return {
        feedType: 'RSS_2_0',
        title: feedTitle,
        description: feedDesc,
        entries,
      };
    } else if (parsed['rdf:RDF']) {
      // RSS 1.0
      const rdf = parsed['rdf:RDF'];
      const channel = rdf.channel || {};
      const feedTitle = cleanText(channel.title) || 'Untitled Feed';
      const feedDesc = cleanText(channel.description) || '';
      const items = ensureArray(rdf.item).slice(0, maxEntries);

      const entries: NormalizedFeedEntry[] = items.map((item: any) => {
        const link = cleanText(item.link);
        const resolvedLink = resolveUrl(link, feedUrl);

        return {
          externalId: resolvedLink,
          title: cleanText(item.title) || 'Untitled Article',
          summary: cleanText(item.description),
          author: cleanText(item['dc:creator'] || item.author),
          originalUrl: resolvedLink,
          canonicalUrl: resolvedLink,
          publishedAt: parsePubDate(item['dc:date'] || item.date),
          imageUrl: extractImage(item),
          categories: ensureArray(item.category).map((c: any) => cleanText(c)).filter(Boolean),
          rawMetadata: item,
        };
      });

      return {
        feedType: 'RSS_1_0',
        title: feedTitle,
        description: feedDesc,
        entries,
      };
    } else if (parsed.feed) {
      // Atom
      const feed = parsed.feed;
      const feedTitle = cleanText(feed.title) || 'Untitled Feed';
      const feedDesc = cleanText(feed.subtitle || feed.summary) || '';
      const entriesRaw = ensureArray(feed.entry).slice(0, maxEntries);

      const entries: NormalizedFeedEntry[] = entriesRaw.map((entry: any) => {
        let originalLink = '';
        if (entry.link) {
          const links = ensureArray(entry.link);
          const alternateLink = links.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
          originalLink = cleanText(alternateLink ? alternateLink['@_href'] : links[0]['@_href']);
        }
        if (!originalLink) {
          originalLink = cleanText(entry.id);
        }
        const resolvedLink = resolveUrl(originalLink, feedUrl);

        const authorNode = ensureArray(entry.author)[0];
        const authorName = authorNode ? cleanText(authorNode.name || authorNode) : undefined;

        return {
          externalId: cleanText(entry.id || originalLink),
          title: cleanText(entry.title) || 'Untitled Article',
          summary: cleanText(entry.summary || entry.content),
          author: authorName,
          originalUrl: resolvedLink,
          canonicalUrl: resolvedLink,
          publishedAt: parsePubDate(entry.published || entry.updated),
          imageUrl: extractImage(entry),
          categories: ensureArray(entry.category).map((c: any) => cleanText(c['@_term'] || c)).filter(Boolean),
          rawMetadata: entry,
        };
      });

      return {
        feedType: 'ATOM',
        title: feedTitle,
        description: feedDesc,
        entries,
      };
    }
  }

  throw new Error('SOURCE_UNSUPPORTED_FEED');
}
