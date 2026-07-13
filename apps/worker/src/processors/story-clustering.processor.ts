/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  getTokens,
  calculateJaccardSimilarity,
  ClusterStatus,
} from '@newsflow/database';

@Processor('story-clustering')
@Injectable()
export class StoryClusteringProcessor extends WorkerHost {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { articleId, workspaceId } = job.data;
    this.logger.log(`Processing clustering job for article ${articleId}`, 'StoryClusteringProcessor');

    const article = await this.db.article.findFirst({
      where: { id: articleId, workspaceId },
    });

    if (!article) {
      this.logger.error(`Article ${articleId} not found`, '', 'StoryClusteringProcessor');
      return;
    }

    try {
      // Configuration parameters
      const windowHours = 24;
      const similarityThreshold = 0.3;

      const timeLimit = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      // Fetch active clusters updated within the window
      const activeClusters = await this.db.storyCluster.findMany({
        where: {
          workspaceId,
          status: ClusterStatus.ACTIVE,
          lastArticleAt: { gte: timeLimit },
        },
        include: {
          clusterArticles: {
            include: {
              article: {
                select: {
                  title: true,
                  normalizedTitle: true,
                },
              },
            },
          },
        },
      });

      const newArticleTokens = getTokens(article.normalizedTitle);

      let bestClusterId: string | null = null;
      let highestSimilarity = 0;

      for (const cluster of activeClusters) {
        // Compare with articles in this cluster
        for (const clusterArticle of cluster.clusterArticles) {
          const compTokens = getTokens(clusterArticle.article.normalizedTitle);
          const similarity = calculateJaccardSimilarity(newArticleTokens, compTokens);

          if (similarity >= similarityThreshold && similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestClusterId = cluster.id;
          }
        }
      }

      if (bestClusterId) {
        // Link to best cluster
        await this.db.storyClusterArticle.create({
          data: {
            clusterId: bestClusterId,
            articleId,
            similarityScore: highestSimilarity,
            isPrimarySource: false,
          },
        });

        // Update cluster timestamp
        await this.db.storyCluster.update({
          where: { id: bestClusterId },
          data: {
            lastArticleAt: article.publishedAt || new Date(),
          },
        });

        this.logger.log(
          `Linked article ${articleId} to cluster ${bestClusterId} with similarity score ${highestSimilarity.toFixed(2)}`,
          'StoryClusteringProcessor',
        );
      } else {
        // Create new story cluster
        const newCluster = await this.db.storyCluster.create({
          data: {
            workspaceId,
            canonicalTopic: article.title,
            category: article.category,
            startedAt: article.publishedAt || new Date(),
            lastArticleAt: article.publishedAt || new Date(),
            status: ClusterStatus.ACTIVE,
          },
        });

        // Link as primary source
        await this.db.storyClusterArticle.create({
          data: {
            clusterId: newCluster.id,
            articleId,
            similarityScore: 1.0,
            isPrimarySource: true,
          },
        });

        this.logger.log(`Created new cluster ${newCluster.id} for article ${articleId}`, 'StoryClusteringProcessor');
      }
    } catch (err: any) {
      this.logger.error(`Error clustering article ${articleId}`, err.stack, 'StoryClusteringProcessor');
    }
  }
}
