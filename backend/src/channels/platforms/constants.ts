import { Platform, PlatformMetadata } from '@cms-ng/shared';

export const PLATFORM_METADATA: Record<Platform, PlatformMetadata> = {
  [Platform.WEBSITE]: {
    key: Platform.WEBSITE,
    name: '官网/APP',
    description: 'LC 传媒官方网站和移动应用',
    maxTitleLength: 100,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['16:9', '4:3'],
    styleGuide:
      '完整长文报道，保留所有细节、引用和数据。使用专业新闻写作风格，分段清晰，标题层级分明。',
  },
  [Platform.FACEBOOK]: {
    key: Platform.FACEBOOK,
    name: 'Facebook',
    description: 'Facebook 社交帖子',
    maxTitleLength: 80,
    maxContentLength: 2000,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['1.91:1', '1:1'],
    styleGuide:
      '提炼核心观点，增加互动引导语（如「你怎麼看？」「留言告訴我們」）。适当使用emoji增加亲和力。保持口语化但专业。',
  },
  [Platform.INSTAGRAM]: {
    key: Platform.INSTAGRAM,
    name: 'Instagram',
    description: 'Instagram 图文帖',
    maxTitleLength: 60,
    maxContentLength: 800,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['1:1', '4:5', '9:16'],
    styleGuide:
      '极简文字，视觉为主。文案简短有力，多用换行和emoji。 hashtag 放在文末。语气年轻活泼。',
  },
  [Platform.X]: {
    key: Platform.X,
    name: 'X / Twitter',
    description: 'X（原Twitter）推文',
    maxTitleLength: 50,
    maxContentLength: 280,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['16:9', '1:1'],
    styleGuide:
      '极短精炼，一句话概括核心信息。可用 thread 形式展开。语气直接、有冲击力。',
  },
  [Platform.THREADS]: {
    key: Platform.THREADS,
    name: 'Threads',
    description: 'Threads 文字串流',
    maxTitleLength: 60,
    maxContentLength: 500,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['1:1', '4:5'],
    styleGuide:
      '介于 Twitter 和 Instagram 之间的轻松语气。适合分享观点、引发讨论。可用连续串形式讲故事。',
  },
  [Platform.LINKEDIN]: {
    key: Platform.LINKEDIN,
    name: 'LinkedIn',
    description: 'LinkedIn 专业帖子',
    maxTitleLength: 80,
    maxContentLength: 1500,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['1.91:1', '1:1'],
    styleGuide:
      '专业、深度、有见解。适合行业分析和观点分享。语气正式但有温度，可引用数据和案例。',
  },
  [Platform.XIAOHONGSHU]: {
    key: Platform.XIAOHONGSHU,
    name: '小红书',
    description: '小红书笔记',
    maxTitleLength: 40,
    maxContentLength: 1000,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['3:4', '1:1'],
    styleGuide:
      '种草风格，大量emoji点缀，分点排版（用「✅」「📌」「💡」等符号）。标题要吸引眼球（带数字、疑问、感叹）。语气亲切如朋友分享。',
  },
  [Platform.YOUTUBE]: {
    key: Platform.YOUTUBE,
    name: 'YouTube',
    description: 'YouTube 视频',
    maxTitleLength: 100,
    maxContentLength: 5000,
    supportsImages: true,
    supportsVideo: true,
    aspectRatios: ['16:9'],
    styleGuide:
      '视频标题要SEO友好，含关键词。描述区要详细，含时间戳、相关链接、hashtag。语气热情、有感染力。',
  },
  [Platform.PUSH]: {
    key: Platform.PUSH,
    name: '即时推送',
    description: 'App 推送通知',
    maxTitleLength: 30,
    maxContentLength: 100,
    supportsImages: false,
    supportsVideo: false,
    aspectRatios: [],
    styleGuide:
      '一句话快讯，突出时间性和冲击力。标题必须极度精炼，制造紧迫感或好奇心。',
  },
};

export const ALL_PLATFORMS = Object.values(Platform);
