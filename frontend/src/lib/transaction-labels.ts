// Shared transaction label maps so 计费管理 and 账号管理 render identical labels
// for the same TransactionType / BillingCategory (single source of truth).

export const transactionTypeLabels: Record<string, string> = {
  TOP_UP: '充值',
  AI_LLM: 'AI调用',
  AI_IMAGE: '图片生成',
  PUBLISH: '发布',
  AUTO_PUBLISH: '自动发布',
  DATA_FETCH: '数据抓取',
  REFUND: '退款',
  ADJUSTMENT: '调整',
};

export const transactionCategoryLabels: Record<string, string> = {
  AI: 'AI 消费',
  PUBLISHING: '发布消费',
  OTHER: '其他',
};
