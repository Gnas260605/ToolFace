/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitizeHtml from 'sanitize-html';
import {
  safeFetch,
  calculateHash,
  ArticleExtractionStatus,
  ArticleRiskLevel,
} from '@newsflow/database';

@Processor('article-extraction')
@Injectable()
export class ArticleExtractionProcessor extends WorkerHost {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { articleId, workspaceId } = job.data;
    this.logger.log(`Processing extraction job for article ${articleId}`, 'ArticleExtractionProcessor');

    const article = await this.db.article.findFirst({
      where: { id: articleId, workspaceId },
    });

    if (!article) {
      this.logger.error(`Article ${articleId} not found`, '', 'ArticleExtractionProcessor');
      return;
    }

    if (article.extractionStatus !== ArticleExtractionStatus.PENDING) {
      this.logger.log(`Article ${articleId} extraction status is not PENDING, skipping`, 'ArticleExtractionProcessor');
      return;
    }

    try {
      // 1. Fetch HTML safely
      const res = await safeFetch(article.originalUrl, {
        allowHttpInDev: true,
        maxBytes: 8 * 1024 * 1024, // cap HTML size at 8MB
      });

      // 2. Parse HTML using JSDOM
      const dom = new JSDOM(res.body, {
        url: article.originalUrl,
        contentType: 'text/html',
      });

      // 3. Extract readable text using Readability
      const reader = new Readability(dom.window.document);
      const parsed = reader.parse();

      if (!parsed) {
        throw new Error('ARTICLE_EXTRACTION_FAILED');
      }

      // 4. Sanitize text and excerpt (no HTML tags allowed in excerpt)
      const cleanExcerpt = sanitizeHtml(parsed.excerpt || parsed.textContent || '', {
        allowedTags: [],
        allowedAttributes: {},
      })
        .trim()
        .slice(0, 2000); // limit excerpt to 2000 characters

      // 5. Calculate new content hash based on extracted text
      const contentHash = calculateHash(parsed.textContent || '');

      // Check Layer 2: Content Hash uniqueness in workspace
      const duplicateContent = await this.db.article.findFirst({
        where: {
          workspaceId,
          contentHash,
          id: { not: articleId },
        },
      });

      let riskLevel: ArticleRiskLevel = ArticleRiskLevel.LOW;
      if (duplicateContent) {
        // Mark as likely duplicate relationship (risk level medium)
        riskLevel = ArticleRiskLevel.MEDIUM;
      }

      // 6. Update Article
      await this.db.article.update({
        where: { id: articleId },
        data: {
          contentExcerpt: cleanExcerpt || article.summary,
          contentHash,
          extractionStatus: ArticleExtractionStatus.SUCCESS,
          riskLevel,
          author: parsed.byline || article.author,
        },
      });

      this.logger.log(`Successfully completed extraction for article ${articleId}`, 'ArticleExtractionProcessor');
    } catch (err: any) {
      this.logger.error(`Error extracting article ${articleId}: ${err.message}`, err.stack, 'ArticleExtractionProcessor');

      await this.db.article.update({
        where: { id: articleId },
        data: {
          extractionStatus: ArticleExtractionStatus.FAILED,
        },
      });
    }
  }
}
