/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { JsonLogger } from '../common/logger.service';
import {
  getTokens,
  calculateJaccardSimilarity,
  ClusterStatus,
  SourceTrustLevel,
  calculateCosineSimilarity,
  getEmbedding,
} from '@newsflow/database';

@Processor('story-clustering')
@Injectable()
export class StoryClusteringProcessor extends WorkerHost {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
    @InjectQueue('draft-generation') private readonly draftQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { articleId, workspaceId, correlationId } = job.data;
    this.logger.log(`Processing clustering job for article ${articleId}`, 'StoryClusteringProcessor');

    const article = await this.db.article.findFirst({
      where: { id: articleId, workspaceId },
      include: { source: true },
    });

    if (!article) {
      this.logger.error(`Article ${articleId} not found`, '', 'StoryClusteringProcessor');
      return;
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      let newEmbeddingValues: number[] | null = null;

      // 1. Get embedding for the new article if API key is present
      if (apiKey) {
        try {
          newEmbeddingValues = await getEmbedding(article.title, apiKey);
          await this.db.articleEmbedding.upsert({
            where: { articleId },
            update: { valuesJson: newEmbeddingValues as any },
            create: { articleId, valuesJson: newEmbeddingValues as any },
          });
        } catch (e: any) {
          this.logger.warn(`Failed to get embedding for article ${articleId}: ${e.message}`, 'StoryClusteringProcessor');
        }
      }

      // Load configuration & policy
      const policy = await this.db.editorialPolicy.findUnique({
        where: { workspaceId },
      });
      const maxSimilarityThreshold = policy?.maximumSimilarityScore ?? 0.75;
      const windowHours = 24;
      const timeLimit = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      // 2. Fetch active clusters
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
                include: {
                  source: true,
                },
              },
            },
          },
        },
      });

      let bestClusterId: string | null = null;
      let highestSimilarity = 0;
      let isDuplicate = false;

      // Fetch embeddings for all articles in active clusters
      const activeArticleIds = activeClusters.flatMap(c => c.clusterArticles.map(ca => ca.articleId));
      const existingEmbeddings = await this.db.articleEmbedding.findMany({
        where: { articleId: { in: activeArticleIds } },
      });

      const embeddingMap = new Map<string, number[]>();
      for (const emb of existingEmbeddings) {
        if (Array.isArray(emb.valuesJson)) {
          embeddingMap.set(emb.articleId, emb.valuesJson as number[]);
        }
      }

      const newArticleTokens = getTokens(article.normalizedTitle);

      for (const cluster of activeClusters) {
        for (const clusterArticle of cluster.clusterArticles) {
          let similarity = 0;

          // If we have embedding values for both, calculate cosine similarity
          const existingEmb = embeddingMap.get(clusterArticle.articleId);
          if (newEmbeddingValues && existingEmb) {
            similarity = calculateCosineSimilarity(newEmbeddingValues, existingEmb);
          } else {
            // Fallback to Jaccard title similarity
            const compTokens = getTokens(clusterArticle.article.normalizedTitle);
            similarity = calculateJaccardSimilarity(newArticleTokens, compTokens);
          }

          if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestClusterId = cluster.id;
          }
        }
      }

      // If highest similarity is above the workspace policy threshold, link to the cluster
      const linkThreshold = 0.3; // Minimum similarity to group in a cluster
      const duplicateThreshold = maxSimilarityThreshold; // Threshold where it is too identical

      if (highestSimilarity >= duplicateThreshold) {
        isDuplicate = true;
        this.logger.log(`Article ${articleId} is marked as duplicate (similarity: ${highestSimilarity.toFixed(2)} >= ${duplicateThreshold})`, 'StoryClusteringProcessor');
      }

      let targetClusterId = bestClusterId;

      if (highestSimilarity >= linkThreshold && bestClusterId) {
        // Link to existing cluster
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

        targetClusterId = newCluster.id;

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

      // 3. Re-calculate Trend Score for the target cluster
      if (targetClusterId && !isDuplicate) {
        await this.updateClusterTrendScore(targetClusterId, workspaceId, correlationId);
      }

    } catch (err: any) {
      this.logger.error(`Error clustering article ${articleId}`, err.stack, 'StoryClusteringProcessor');
    }
  }

  private async updateClusterTrendScore(clusterId: string, workspaceId: string, correlationId: string) {
    const cluster = await this.db.storyCluster.findUnique({
      where: { id: clusterId },
      include: {
        clusterArticles: {
          include: {
            article: {
              include: {
                source: true,
              },
            },
          },
        },
      },
    });

    if (!cluster) return;

    // Load blocked and preferred keywords for the workspace
    const blockedKeywords = await this.db.blockedKeyword.findMany({ where: { workspaceId } });
    const preferredKeywords = await this.db.preferredKeyword.findMany({ where: { workspaceId } });

    const articles = cluster.clusterArticles.map(ca => ca.article);
    const uniqueSources = new Set(articles.map(a => a.sourceId));
    const sourceCount = uniqueSources.size;

    // Calculate average trust multiplier of sources
    let totalTrustMultiplier = 0;
    for (const sourceId of uniqueSources) {
      const art = articles.find(a => a.sourceId === sourceId);
      const trust = art?.source.trustLevel || SourceTrustLevel.MEDIUM;
      let mult = 1.0;
      if (trust === SourceTrustLevel.OFFICIAL) mult = 1.5;
      else if (trust === SourceTrustLevel.HIGH) mult = 1.3;
      else if (trust === SourceTrustLevel.LOW) mult = 0.5;
      totalTrustMultiplier += mult;
    }
    const avgTrustMultiplier = sourceCount > 0 ? totalTrustMultiplier / sourceCount : 1.0;

    // Velocity calculation: how fast are articles appearing?
    const started = new Date(cluster.startedAt);
    const last = new Date(cluster.lastArticleAt);
    const hoursSinceStarted = Math.max(0.1, (last.getTime() - started.getTime()) / (1000 * 60 * 60));
    const velocity = articles.length / hoursSinceStarted;

    // Keywords hits in cluster topic or titles
    const textToCheck = `${cluster.canonicalTopic} ${articles.map(a => a.title).join(' ')}`.toLowerCase();
    
    let blockedHits = 0;
    for (const kw of blockedKeywords) {
      if (textToCheck.includes(kw.keyword.toLowerCase())) {
        blockedHits++;
      }
    }

    let preferredHits = 0;
    let preferredMultiplier = 1.0;
    for (const kw of preferredKeywords) {
      if (textToCheck.includes(kw.keyword.toLowerCase())) {
        preferredHits++;
        preferredMultiplier *= kw.weight;
      }
    }

    // 1. Google Trends search traffic signal
    let maxApproxTraffic = 0;
    for (const art of articles) {
      const meta = art.metadataJson as any;
      if (meta?.approxTraffic && typeof meta.approxTraffic === 'number') {
        if (meta.approxTraffic > maxApproxTraffic) maxApproxTraffic = meta.approxTraffic;
      }
    }

    let trafficBoost = 0;
    if (maxApproxTraffic >= 500000) trafficBoost = 8.0;
    else if (maxApproxTraffic >= 100000) trafficBoost = 5.0;
    else if (maxApproxTraffic >= 50000) trafficBoost = 3.0;
    else if (maxApproxTraffic >= 10000) trafficBoost = 1.5;
    else if (maxApproxTraffic > 0) trafficBoost = 0.5;

    // 2. AI Viral Score signal
    let maxViralScore = 0;
    for (const art of articles) {
      if ((art as any).viralScore && (art as any).viralScore > maxViralScore) {
        maxViralScore = (art as any).viralScore;
      }
    }
    let viralBoost = 0;
    if (maxViralScore >= 80) viralBoost = 5.0;
    else if (maxViralScore >= 60) viralBoost = 2.5;

    // 3. Base score calculation (bỏ phụ thuộc cứng vào nhiều nguồn, hỗ trợ tin 1-nguồn nhưng traffic cao)
    const baseSourceScore = Math.max(1.5, sourceCount * 1.5);
    const baseScore = baseSourceScore + trafficBoost + viralBoost;

    // Time decay: exponential decay over the age of the trend (time since last article updated vs now)
    const hoursAge = Math.max(0.1, (Date.now() - last.getTime()) / (1000 * 60 * 60));
    const decayLambda = Math.log(2) / 12; // 12 hours half-life
    const recencyFactor = Math.exp(-decayLambda * hoursAge);

    let trendScore = baseScore * avgTrustMultiplier * recencyFactor * preferredMultiplier;

    if (blockedHits > 0) {
      trendScore = 0.0;
    }

    const explanation = blockedHits > 0 
      ? `Điểm xu hướng bằng 0 do chứa ${blockedHits} từ khóa bị chặn.`
      : `Điểm cơ bản: ${baseScore.toFixed(1)} (${sourceCount} nguồn, Traffic: ${maxApproxTraffic > 0 ? maxApproxTraffic.toLocaleString() : 'N/A'}, Viral: ${maxViralScore > 0 ? maxViralScore + '/100' : 'N/A'}), Hệ số tin cậy: ${avgTrustMultiplier.toFixed(1)}, Hệ số thời gian: ${recencyFactor.toFixed(2)} (${hoursAge.toFixed(1)}h tuổi), Thưởng từ khóa: x${preferredMultiplier.toFixed(2)}.`;

    await this.db.storyCluster.update({
      where: { id: clusterId },
      data: {
        trendScore,
        trendExplanation: explanation,
        sourceCount,
        velocity,
        reliabilityScore: avgTrustMultiplier,
      },
    });

    this.logger.log(`Updated Trend Score for Cluster ${clusterId} to ${trendScore.toFixed(2)}. Explanation: ${explanation}`, 'StoryClusteringProcessor');

    // Auto-enqueue AI editorial draft generation if trend score is high or viral score meets policy threshold
    const policy = await this.db.editorialPolicy.findUnique({ where: { workspaceId } });
    const threshold = (policy as any)?.autoDraftTrendThreshold ?? 5.0;
    const minViral = (policy as any)?.autoDraftMinViralScore ?? 80;

    const isQualifying = (trendScore >= threshold || (maxViralScore > 0 && maxViralScore >= minViral));

    if (isQualifying && blockedHits === 0) {
      const existingDraft = await this.db.draft.findFirst({
        where: { clusterId, archivedAt: null },
      });

      if (!existingDraft) {
        this.logger.log(`Cluster ${clusterId} đạt chuẩn (Trend Score: ${trendScore.toFixed(2)} >= ${threshold} hoặc Viral: ${maxViralScore}/100 >= ${minViral}). Auto-triggering Draft Generation!`, 'StoryClusteringProcessor');
        
        // Find default brand profile
        const brandProfile = await this.db.brandProfile.findFirst({
          where: { workspaceId, isDefault: true, deletedAt: null },
        });

        if (brandProfile) {
          await this.draftQueue.add(
            'generate',
            {
              workspaceId,
              clusterId,
              brandProfileId: brandProfile.id,
              correlationId,
            },
            {
              jobId: `draft-gen-cluster-${clusterId}`,
            }
          );
        } else {
          this.logger.warn(`Cannot auto-generate draft: No default BrandProfile found in workspace ${workspaceId}`, 'StoryClusteringProcessor');
        }
      }
    }
  }
}
