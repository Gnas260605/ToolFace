import { Source } from '@newsflow/database';

export interface RawArticleData {
  title: string;
  summary?: string;
  author?: string;
  originalUrl: string;
  canonicalUrl: string;
  publishedAt: Date;
  imageUrl?: string;
  categories: string[];
  rawMetadata?: Record<string, unknown>;
}

export interface SourceAdapter {
  fetch(source: Source): Promise<RawArticleData[]>;
}
