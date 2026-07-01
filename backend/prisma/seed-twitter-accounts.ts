/**
 * Seed X (Twitter) watch accounts + billing config for the X data source.
 *
 * Run: cd backend && npx ts-node prisma/seed-twitter-accounts.ts
 *
 * Seeds:
 *   1. A default watch list of popular X accounts (media + wire + tech KOLs).
 *   2. A billing config row for `x_trending_fetch` (unitPrice 0.05 / call).
 */
import { PrismaClient, BillingCategory } from '@prisma/client';

const prisma = new PrismaClient();

// 默认热门账号清单（管理员可后续经 /trending-topics/x-watch 增删）
// 所有 handle 均经 twitterapi.io user/info 校验存在（2026-07）。
const defaultWatchAccounts = [
  // ─── 中国媒体 ───
  { userName: 'CCTV', displayName: 'CCTV 央视新闻', category: '中国媒体' },
  { userName: 'XHNews', displayName: '新华社 China Xinhua News', category: '中国媒体' },
  { userName: 'PDChina', displayName: 'People\'s Daily China', category: '中国媒体' },
  // ─── 国际通讯社 ───
  { userName: 'Reuters', displayName: 'Reuters', category: '国际通讯社' },
  { userName: 'AP', displayName: 'The Associated Press', category: '国际通讯社' },
  // ─── 国际媒体 ───
  { userName: 'BBCNews', displayName: 'BBC News', category: '国际媒体' },
  { userName: 'CNN', displayName: 'CNN', category: '国际媒体' },
  { userName: 'nytimes', displayName: 'The New York Times', category: '国际媒体' },
  // ─── 财经媒体 ───
  { userName: 'FT', displayName: 'Financial Times', category: '财经媒体' },
  { userName: 'WSJ', displayName: 'The Wall Street Journal', category: '财经媒体' },

  // ─── AI 实验室 / 机构官号 ───
  { userName: 'OpenAI', displayName: 'OpenAI', category: 'AI 机构' },
  { userName: 'AnthropicAI', displayName: 'Anthropic', category: 'AI 机构' },
  { userName: 'GoogleDeepMind', displayName: 'Google DeepMind', category: 'AI 机构' },
  { userName: 'MetaAI', displayName: 'Meta AI', category: 'AI 机构' },
  { userName: 'xai', displayName: 'xAI', category: 'AI 机构' },
  { userName: 'huggingface', displayName: 'Hugging Face', category: 'AI 机构' },
  { userName: 'StabilityAI', displayName: 'Stability AI', category: 'AI 机构' },
  { userName: 'MistralAI', displayName: 'Mistral AI', category: 'AI 机构' },

  // ─── AI 创业者 / CEO ───
  { userName: 'elonmusk', displayName: 'Elon Musk (xAI/Tesla)', category: 'AI 创业者' },
  { userName: 'sama', displayName: 'Sam Altman (OpenAI)', category: 'AI 创业者' },
  { userName: 'ylecun', displayName: 'Yann LeCun (Meta AI)', category: 'AI 创业者' },
  { userName: 'DarioAmodei', displayName: 'Dario Amodei (Anthropic)', category: 'AI 创业者' },
  { userName: 'gdb', displayName: 'Greg Brockman (OpenAI)', category: 'AI 创业者' },
  { userName: 'miramurati', displayName: 'Mira Murati (Thinking Machines)', category: 'AI 创业者' },

  // ─── AI 研究者 / 学者 ───
  { userName: 'karpathy', displayName: 'Andrej Karpathy', category: 'AI 研究者' },
  { userName: 'fchollet', displayName: 'François Chollet (Keras creator)', category: 'AI 研究者' },
  { userName: 'AndrewYNg', displayName: 'Andrew Ng', category: 'AI 研究者' },
  { userName: 'goodfellow_ian', displayName: 'Ian Goodfellow (GAN inventor)', category: 'AI 研究者' },
  { userName: 'hardmaru', displayName: 'David Ha (Sakana AI)', category: 'AI 研究者' },
  { userName: '_jasonwei', displayName: 'Jason Wei (reasoning/CoT)', category: 'AI 研究者' },

  // ─── AI 评论 / 投资 / 资讯 ───
  { userName: 'swyx', displayName: 'swyx (Latent Space)', category: 'AI 评论' },
  { userName: 'emollick', displayName: 'Ethan Mollick (Wharton)', category: 'AI 评论' },
  { userName: 'GaryMarcus', displayName: 'Gary Marcus', category: 'AI 评论' },
  { userName: 'stratechery', displayName: 'Ben Thompson (Stratechery)', category: 'AI 评论' },
  { userName: 'AllieKMiller', displayName: 'Allie K. Miller', category: 'AI 评论' },
  { userName: 'rowancheung', displayName: 'Rowan Cheung (The Rundown AI)', category: 'AI 资讯' },
  { userName: 'mreflow', displayName: 'Matt Wolfe (AI news)', category: 'AI 资讯' },
];

// X 数据源拉取计费项（缓存未命中、实打 twitterapi.io 时扣费）
const xBillingConfig = {
  category: BillingCategory.OTHER,
  itemKey: 'x_trending_fetch',
  itemName: 'X 数据源拉取 (每次)',
  unitPrice: 0.05,
  unit: 'per_call',
};

export async function seedTwitterAccounts() {
  console.log('Seeding X watch accounts...');
  for (const acc of defaultWatchAccounts) {
    await prisma.twitterWatchAccount.upsert({
      where: { userName: acc.userName },
      update: {},
      create: acc,
    });
  }
  console.log(`Seeded ${defaultWatchAccounts.length} X watch accounts.`);

  console.log('Seeding X billing config...');
  await prisma.billingConfig.upsert({
    where: {
      category_itemKey: {
        category: xBillingConfig.category,
        itemKey: xBillingConfig.itemKey,
      },
    },
    update: {},
    create: xBillingConfig,
  });
  console.log('Seeded x_trending_fetch billing config.');
}

// Standalone execution
if (require.main === module) {
  seedTwitterAccounts()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
