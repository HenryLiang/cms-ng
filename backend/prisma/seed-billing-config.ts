/**
 * Default billing configuration seed data.
 * Run after migration: npx prisma db seed
 * Or import and call seedBillingConfig() from your seed script.
 */
import { PrismaClient, BillingCategory } from '@prisma/client';

const prisma = new PrismaClient();

const defaultBillingConfigs = [
  // AI
  { category: BillingCategory.AI, itemKey: 'ai_llm_per_1k_tokens', itemName: 'AI LLM 调用 (每1K tokens)', unitPrice: 0.02, unit: 'per_1k_tokens' },
  { category: BillingCategory.AI, itemKey: 'ai_image_per_piece', itemName: 'AI 图片生成 (每张)', unitPrice: 0.5, unit: 'per_image' },

  // Publishing
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_website', itemName: '网站发布', unitPrice: 0.0, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_wordpress', itemName: 'WordPress 发布', unitPrice: 0.1, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_facebook', itemName: 'Facebook 发布', unitPrice: 0.15, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_instagram', itemName: 'Instagram 发布', unitPrice: 0.15, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_xiaohongshu', itemName: '小红书发布', unitPrice: 0.15, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_x', itemName: 'X 发布', unitPrice: 0.1, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_threads', itemName: 'Threads 发布', unitPrice: 0.1, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_linkedin', itemName: 'LinkedIn 发布', unitPrice: 0.1, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_youtube', itemName: 'YouTube 发布', unitPrice: 0.1, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'publish_push', itemName: 'Push 推送', unitPrice: 0.1, unit: 'per_article' },
  { category: BillingCategory.PUBLISHING, itemKey: 'auto_publish_surcharge', itemName: '自动发布附加费', unitPrice: 0.05, unit: 'per_run' },
];

export async function seedBillingConfig() {
  console.log('Seeding billing configs...');
  for (const config of defaultBillingConfigs) {
    await prisma.billingConfig.upsert({
      where: {
        category_itemKey: {
          category: config.category,
          itemKey: config.itemKey,
        },
      },
      update: {},
      create: config,
    });
  }
  console.log(`Seeded ${defaultBillingConfigs.length} billing configs.`);
}

// Standalone execution
if (require.main === module) {
  seedBillingConfig()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
