const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const workspaceId = 'default-workspace';
  const userId = 'mock-default-user-id';

  console.log('=== SEEDING DATABASE FOR LOCAL DEVELOPMENT ===');

  // Clean existing seed data
  console.log('>>> Cleaning existing database records...');
  await prisma.draftVersion.deleteMany({});
  await prisma.draft.deleteMany({});
  await prisma.facebookPageConnection.deleteMany({});
  await prisma.brandProfile.deleteMany({});
  await prisma.source.deleteMany({});

  // 1. Create Brand Profile
  console.log('>>> Creating Brand Profile...');
  const brandProfile = await prisma.brandProfile.create({
    data: {
      workspaceId,
      name: 'Báo chí & Chính phủ VN',
      tone: 'FORMAL',
      language: 'vi',
      audience: 'Người dân Việt Nam quan tâm tin tức chính phủ và thời sự',
      writingRulesJson: ['Sử dụng từ ngữ chuẩn mực', 'Trích dẫn nguồn rõ ràng', 'Không suy đoán'],
      forbiddenPhrasesJson: [],
      defaultHashtagsJson: ['Tintuc', 'ChinhPhu'],
      attributionTemplate: 'Theo {source}',
      headlineStyle: 'Formal',
      createdByUserId: userId,
    },
  });

  // 2. Create Facebook Page Connection
  console.log('>>> Creating Mock Facebook Page Connection...');
  await prisma.facebookPageConnection.create({
    data: {
      id: 'demo-page-connection',
      workspaceId,
      pageId: '1234567890',
      pageName: 'Thông tin Chính phủ Việt Nam (Mock)',
      pageCategory: 'Government',
      status: 'ACTIVE',
      grantedTasksJson: ['MANAGE', 'CREATE_CONTENT', 'MODERATE'],
      grantedScopesJson: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
      tokenCiphertext: 'mock_ciphertext_data_here',
      tokenIv: '000000000000000000000000',
      tokenAuthTag: '00000000000000000000000000000000',
      tokenKeyVersion: 'v1',
      tokenFingerprint: 'mock_fingerprint_here',
      connectedByUserId: userId,
    },
  });

  // 3. Create Seed Sources
  console.log('>>> Seeding Source Feeds...');
  const sources = [
    {
      workspaceId,
      name: 'VnExpress',
      domain: 'vnexpress.net',
      feedUrl: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
      sourceType: 'OFFICIAL_RSS',
      language: 'vi',
      country: 'VN',
      category: 'general',
      trustLevel: 'HIGH',
      pollIntervalSeconds: 900,
      attributionName: 'VnExpress',
      status: 'ACTIVE',
      nextPollAt: new Date(),
      createdByUserId: userId,
    },
    {
      workspaceId,
      name: 'Báo Chính Phủ',
      domain: 'baochinhphu.vn',
      feedUrl: 'https://baochinhphu.vn/rss/tin-moi-nhat.rss',
      sourceType: 'OFFICIAL_RSS',
      language: 'vi',
      country: 'VN',
      category: 'government',
      trustLevel: 'HIGH',
      pollIntervalSeconds: 900,
      attributionName: 'Báo Điện tử Chính phủ',
      status: 'ACTIVE',
      nextPollAt: new Date(),
      createdByUserId: userId,
    }
  ];

  for (const source of sources) {
    await prisma.source.create({ data: source });
  }

  // 4. Create Drafts in different states
  console.log('>>> Creating Mock Drafts...');
  
  // A. APPROVED Draft (Ready to publish/schedule)
  const approvedDraft = await prisma.draft.create({
    data: {
      workspaceId,
      status: 'APPROVED',
      brandProfileId: brandProfile.id,
      createdByUserId: userId,
    },
  });

  const approvedVersion = await prisma.draftVersion.create({
    data: {
      draftId: approvedDraft.id,
      workspaceId,
      versionNumber: 1,
      headline: 'Chính phủ triển khai các giải pháp thúc đẩy phát triển kinh tế số năm 2026',
      hook: 'Thúc đẩy số hóa mạnh mẽ toàn diện là nhiệm vụ trọng tâm.',
      body: 'Phó Thủ tướng Chính phủ vừa ký chỉ thị tăng cường các giải pháp phát triển hạ tầng số quốc gia, đẩy mạnh ứng dụng AI và blockchain trong dịch vụ công công ích. Kế hoạch nhằm tối ưu hóa quy trình thủ tục hành chính, mang lại tiện ích thiết thực cho người dân và doanh nghiệp.',
      whyItMatters: 'Định hình chiến lược phát triển công nghệ lâu dài của Việt Nam.',
      discussionQuestion: 'Ý kiến của bạn về việc áp dụng dịch vụ công trực tuyến?',
      hashtagsJson: ['KinhTeSo', 'ChinhPhuSo', 'VietNam2026'],
      attributionLine: 'Theo Báo Điện tử Chính phủ',
      recommendedLink: 'https://baochinhphu.vn/kinh-te-so-2026',
      contentType: 'BREAKING',
      riskFlagsJson: [],
      verificationJson: {},
      similarityScore: 0.1,
      sourceClaimIdsJson: [],
      createdByPlain: 'AI',
      createdByUserId: userId,
    },
  });

  await prisma.draft.update({
    where: { id: approvedDraft.id },
    data: { currentVersionId: approvedVersion.id },
  });

  // B. READY FOR REVIEW Draft
  const reviewDraft = await prisma.draft.create({
    data: {
      workspaceId,
      status: 'READY_FOR_REVIEW',
      brandProfileId: brandProfile.id,
      createdByUserId: userId,
    },
  });

  const reviewVersion = await prisma.draftVersion.create({
    data: {
      draftId: reviewDraft.id,
      workspaceId,
      versionNumber: 1,
      headline: 'Báo Tuổi Trẻ: Đề xuất mở rộng thêm 3 tuyến Metro kết nối vùng TP.HCM',
      hook: 'Hạ tầng giao thông đô thị kết nối vệ tinh sắp có đột phá mới.',
      body: 'Sở Giao thông Vận tải vừa trình Uỷ ban Nhân dân đề án quy hoạch mở rộng hệ thống đường sắt đô thị kết nối Đồng Nai, Bình Dương. Dự án hứa hẹn làm giảm áp lực kẹt xe nội đô và phân bố lại dân cư đô thị.',
      whyItMatters: 'Giải quyết vấn đề giao thông lớn nhất của vùng kinh tế trọng điểm phía Nam.',
      discussionQuestion: 'Bạn mong chờ tuyến Metro nào đi vào hoạt động nhất?',
      hashtagsJson: ['GiaoThong', 'MetroLine', 'TPHCM'],
      attributionLine: 'Theo Báo Tuổi Trẻ',
      recommendedLink: 'https://tuoitre.vn/metro-hcm-2026',
      contentType: 'BREAKING',
      riskFlagsJson: [],
      verificationJson: {},
      similarityScore: 0.05,
      sourceClaimIdsJson: [],
      createdByPlain: 'AI',
      createdByUserId: userId,
    },
  });

  await prisma.draft.update({
    where: { id: reviewDraft.id },
    data: { currentVersionId: reviewVersion.id },
  });

  console.log('=== SEEDING COMPLETED SUCCESSFULLY ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
