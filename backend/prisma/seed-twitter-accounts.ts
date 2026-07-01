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
const defaultWatchAccounts = [
  { userName: 'CCTV', displayName: 'CCTV 央视新闻', category: '中国媒体' },
  { userName: 'XinhuaNews', displayName: '新华社', category: '中国媒体' },
  { userName: 'PDChina', displayName: 'People\'s Daily China', category: '中国媒体' },
  { userName: 'Reuters', displayName: 'Reuters', category: '国际通讯社' },
  { userName: 'AP', displayName: 'The Associated Press', category: '国际通讯社' },
  { userName: 'BBCNews', displayName: 'BBC News', category: '国际媒体' },
  { userName: 'CNN', displayName: 'CNN', category: '国际媒体' },
  { userName: 'nytimes', displayName: 'The New York Times', category: '国际媒体' },
  { userName: 'FT', displayName: 'Financial Times', category: '财经媒体' },
  { userName: 'WSJ', displayName: 'The Wall Street Journal', category: '财经媒体' },
  { userName: 'elonmusk', displayName: 'Elon Musk', category: '科技 KOL' },
  { userName: 'OpenAI', displayName: 'OpenAI', category: '科技 KOL' },
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
