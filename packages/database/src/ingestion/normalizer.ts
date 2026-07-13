import crypto from 'crypto';
import normalizeUrlLib from 'normalize-url';
import { parse as parseDomain } from 'tldts';

export function getDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const domain = parseDomain(parsed.hostname)?.domain;
    return domain || parsed.hostname;
  } catch {
    return '';
  }
}


export function normalizeUrl(url: string): string {
  try {
    return normalizeUrlLib(url, {
      forceHttps: false,
      stripHash: true,
      stripWWW: false,
      removeQueryParameters: [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
      ],
      removeTrailingSlash: true,
      removeDirectoryIndex: [/^index\.[a-z]+$/],
    });
  } catch {
    return url;
  }
}

export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=_`~()?"'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calculateHash(content: string): string {
  if (!content) return calculateHash('empty');
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}
