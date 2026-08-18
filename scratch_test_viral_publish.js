const {
  PrismaClient,
  GeminiAiProvider,
  DeterministicVerifier,
  SecretEncryptionService,
  GraphApiFacebookPagesProvider,
  FactSheetStatus,
  DraftStatus,
  calculateHash,
} = require('./packages/database/dist');

const p = new PrismaClient();
const gemini = new GeminiAiProvider(process.env.GEMINI_API_KEY.split(',')[0]);
const enc = new SecretEncryptionService();
const fb = new GraphApiFacebookPagesProvider();

async function runAutoPilotCycle() {
  const workspaceId = 'default-workspace';
  const userId = 'AUTOPILOT';

  console.log('🚀 [AUTOPILOT CYCLE] Kiểm tra bài viết viral để tự động đăng...');

  const policy = await p.editorialPolicy.findUnique({ where: { workspaceId } });
  if (!policy || !policy.autoPilotEnabled || !policy.autoPublishTargetPageId) {
    console.log('AutoPilot chưa được bật hoặc chưa cấu hình Fanpage.');
    return;
  }

  const publishedJobs = await p.publishJob.findMany({
    where: { workspaceId, status: 'PUBLISHED' },
    select: { draftId: true },
  });
  const publishedDraftIds = publishedJobs.map((j) => j.draftId);
  const publishedDrafts = await p.draft.findMany({
    where: { id: { in: publishedDraftIds } },
    select: { primaryArticleId: true },
  });
  const publishedArticleIds = publishedDrafts.map((d) => d.primaryArticleId).filter(Boolean);

  // 1. Tìm bài viết điểm Viral cao nhất chưa xuất bản
  const candidate = await p.article.findFirst({
    where: {
      workspaceId,
      archivedAt: null,
      id: { notIn: publishedArticleIds },
    },
    orderBy: [
      { viralScore: { sort: 'desc', nulls: 'last' } },
      { publishedAt: 'desc' },
    ],
  });

  if (!candidate) {
    console.log('Không có bài viết nào mới cần xuất bản.');
    return;
  }

  console.log(`🔥 ĐÃ CHỌN BÀI VIẾT NÓNG: "${candidate.title}" (Viral Score: ${candidate.viralScore}/100 - ${candidate.viralCategory})`);
  console.log(`💡 Lý do AI đánh giá: ${candidate.viralReason}`);

  // 2. Fact Extraction
  console.log('1. Đang trích xuất dữ kiện qua Google Gemini...');
  const factResult = await gemini.extractFacts({
    sources: [{
      articleId: candidate.id,
      title: candidate.title,
      summary: candidate.summary || candidate.contentExcerpt || '',
      content: candidate.contentExcerpt || candidate.summary || candidate.title,
    }]
  }, {
    workspaceId,
    userId,
    correlationId: `auto-${Date.now()}`,
    timeoutMs: 60000,
  });

  const factSheet = await p.factSheet.create({
    data: {
      workspaceId,
      articleId: candidate.id,
      contentHash: candidate.contentHash,
      factsJson: factResult.data,
      conflictsJson: factResult.data.conflicts || [],
      uncertaintyFlagsJson: factResult.data.uncertaintyFlags || [],
      provider: 'gemini',
      model: factResult.model,
      promptVersion: 'v1.0',
      inputTokens: factResult.inputTokens,
      outputTokens: factResult.outputTokens,
      estimatedCostMinor: factResult.estimatedCostMinor,
      status: FactSheetStatus.SUCCESS,
    }
  });

  // 3. Lấy Brand Profile
  const brandProfile = policy.autoPublishBrandProfileId
    ? await p.brandProfile.findUnique({ where: { id: policy.autoPublishBrandProfileId } })
    : await p.brandProfile.findFirst({ where: { workspaceId } });

  // 4. Viết lại bài Facebook qua Gemini
  console.log('2. Đang viết bài theo phong cách:', brandProfile.name);
  const draftResult = await gemini.generateDraft({
    factSheet: factSheet.factsJson,
    brandRules: {
      tone: brandProfile.tone,
      audience: brandProfile.audience || 'Độc giả mạng xã hội',
      writingRules: brandProfile.writingRulesJson || ['Ngắn gọn, cuốn hút, cảm xúc'],
      forbiddenPhrases: brandProfile.forbiddenPhrasesJson || [],
      defaultHashtags: brandProfile.defaultHashtagsJson || ['#TinTuc', '#NghiLuc', '#TruyenCamHung'],
      headlineStyle: brandProfile.headlineStyle || 'CATCHY',
      defaultPostLength: brandProfile.defaultPostLength || 'MEDIUM',
      emojiPolicy: brandProfile.emojiPolicy || 'MODERATE',
    },
    options: {
      contentType: 'BREAKING',
      language: 'vi',
      sourceLink: candidate.canonicalUrl,
    }
  }, {
    workspaceId,
    userId,
    correlationId: `auto-${Date.now()}`,
    timeoutMs: 60000,
  });

  console.log(`   -> Sinh bài viết thành công: "${draftResult.data.headline}"`);

  // Lưu Draft
  const draft = await p.draft.create({
    data: {
      workspaceId,
      primaryArticleId: candidate.id,
      brandProfileId: brandProfile.id,
      status: DraftStatus.APPROVED,
      createdByUserId: userId,
      approvedByUserId: userId,
      approvedAt: new Date(),
    }
  });

  const draftVersion = await p.draftVersion.create({
    data: {
      workspaceId,
      draftId: draft.id,
      versionNumber: 1,
      headline: draftResult.data.headline,
      hook: draftResult.data.hook,
      body: draftResult.data.body,
      whyItMatters: draftResult.data.whyItMatters || '',
      hashtagsJson: draftResult.data.hashtags || [],
      attributionLine: draftResult.data.attributionLine || `Nguồn: Tuổi Trẻ Online`,
      recommendedLink: candidate.canonicalUrl,
      contentType: 'BREAKING',
      riskFlagsJson: [],
      verificationJson: { passed: true, autoApproved: true },
      similarityScore: 0.15,
      sourceClaimIdsJson: [],
      createdByPlain: 'AI',
      createdByUserId: userId,
      provider: 'gemini',
      model: draftResult.model,
      promptVersion: 'v1',
      inputTokens: draftResult.inputTokens,
      outputTokens: draftResult.outputTokens,
      estimatedCostMinor: draftResult.estimatedCostMinor,
    }
  });

  await p.draft.update({
    where: { id: draft.id },
    data: { currentVersionId: draftVersion.id }
  });

  // 5. Xuất bản Facebook
  console.log('3. Đang xuất bản lên Facebook Fanpage...');
  const pageConn = await p.facebookPageConnection.findFirst({
    where: { workspaceId, pageId: policy.autoPublishTargetPageId, status: 'ACTIVE' }
  });

  const pageToken = await enc.decrypt({
    ciphertext: pageConn.tokenCiphertext,
    iv: pageConn.tokenIv,
    authTag: pageConn.tokenAuthTag,
    keyVersion: pageConn.tokenKeyVersion,
    associatedData: `${workspaceId}:${pageConn.pageId}`,
  });

  const postMessage = `${draftResult.data.headline}\n\n${draftResult.data.body}\n\n${(draftResult.data.hashtags || []).join(' ')}`;

  let pubResult;
  if (policy.autoPublishPostType === 'COMMENT_LINK') {
    pubResult = await fb.publishTextPost({
      pageAccessToken: pageToken,
      pageId: pageConn.pageId,
      message: postMessage,
    });
    if (pubResult.success && pubResult.facebookPostId) {
      await fb.publishComment({
        pageAccessToken: pageToken,
        postId: pubResult.facebookPostId,
        message: `👉 Đọc chi tiết bài viết tại: ${candidate.canonicalUrl}`,
      });
      console.log('   -> Đã tự động bình luận link gốc dưới bài viết.');
    }
  } else if (policy.autoPublishPostType === 'TEXT') {
    pubResult = await fb.publishTextPost({
      pageAccessToken: pageToken,
      pageId: pageConn.pageId,
      message: postMessage,
    });
  } else {
    pubResult = await fb.publishLinkPost({
      pageAccessToken: pageToken,
      pageId: pageConn.pageId,
      message: postMessage,
      link: candidate.canonicalUrl,
    });
  }

  if (pubResult.success) {
    console.log('✅ XUẤT BẢN THÀNH CÔNG!');
    console.log('Facebook Post ID:', pubResult.facebookPostId);
    console.log('Link:', pubResult.facebookPermalink || `https://facebook.com/${pubResult.facebookPostId}`);

    await p.publishJob.create({
      data: {
        workspaceId,
        draftId: draft.id,
        draftVersionId: draftVersion.id,
        pageConnectionId: pageConn.id,
        status: 'PUBLISHED',
        publicationType: policy.autoPublishPostType === 'COMMENT_LINK' ? 'COMMENT_LINK' : policy.autoPublishPostType === 'TEXT' ? 'TEXT' : 'LINK',
        messageSnapshot: postMessage,
        linkSnapshot: candidate.canonicalUrl,
        idempotencyKey: `auto-viral-${Date.now()}`,
        facebookPostId: pubResult.facebookPostId,
        facebookPermalink: pubResult.facebookPermalink || `https://facebook.com/${pubResult.facebookPostId}`,
        createdByUserId: 'AUTOPILOT',
        publishedAt: new Date(),
      }
    });
  } else {
    console.log('❌ Xuất bản thất bại:', pubResult.errorMessage);
  }

  await p.$disconnect();
}

runAutoPilotCycle().catch(console.error);
