/**
 * Paddle 订阅套餐配置。
 *
 * priceId 对应 Paddle sandbox 目录（scripts/seed-paddle-catalog.ts 创建）；
 * sandbox 与 production 的 ID 完全隔离，切换环境时需同步替换这里的 ID。
 * 金额不在前端维护——展示价格一律来自 Paddle PricePreview 的 formattedTotals。
 */
export interface Tier {
  name: 'Starter' | 'Pro' | 'Advanced';
  description: string;
  features: string[];
  priceId: { month: string; year: string };
}

export const PricingTiers: Tier[] = [
  {
    name: 'Starter',
    description: '适合刚开始创作的个人用户。',
    features: ['AI 文章创作（基础额度）', '1 个发布渠道', '基础排版模板', '邮件支持'],
    priceId: {
      month: 'pri_01m4ff81ccmg7dtahf9mtwjah0',
      year: 'pri_01m4ff81pkzz4vxsvpcr3jf6h9',
    },
  },
  {
    name: 'Pro',
    description: '适合专业创作者和小型团队。',
    features: ['AI 文章创作（标准额度）', '5 个发布渠道', '热点研究套件', '事实核查与审校', '优先支持'],
    priceId: {
      month: 'pri_01m4ff82czn89p1skydeae6whk',
      year: 'pri_01m4ff82pbsvzn4mcspt4s97sh',
    },
  },
  {
    name: 'Advanced',
    description: '适合规模化运作的内容团队。',
    features: ['AI 文章创作（不限量）', '不限发布渠道', '自动发布工作流', '团队协作与权限', '专属客户成功经理'],
    priceId: {
      month: 'pri_01m4ff83bv3wjdkqvvyjbx1ncx',
      year: 'pri_01m4ff83tv71v3hpasja1gwcwj',
    },
  },
];
