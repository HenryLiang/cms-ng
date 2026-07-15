/**
 * Shared serializer for BillingTransaction rows.
 *
 * Used by both BillingService and UsersService so the transaction shape can
 * never drift between the 计费管理 and 账号管理 surfaces. Prisma Decimal
 * fields are coerced to plain numbers here, once.
 */
export type SerializableBillingTransaction = {
  id: string;
  userId: string;
  type: string;
  category: string;
  amount: unknown;
  balanceAfter: unknown;
  description: string;
  articleId: string | null;
  aiOperationId: string | null;
  platformPublishId: string | null;
  quantity: unknown;
  unitPrice: unknown;
  status: string;
  createdAt: Date;
};

export function serializeBillingTransaction(t: SerializableBillingTransaction) {
  return {
    id: t.id,
    userId: t.userId,
    type: t.type,
    category: t.category,
    amount: Number(t.amount),
    balanceAfter: Number(t.balanceAfter),
    description: t.description,
    articleId: t.articleId,
    aiOperationId: t.aiOperationId,
    platformPublishId: t.platformPublishId,
    quantity: t.quantity ? Number(t.quantity) : null,
    unitPrice: t.unitPrice ? Number(t.unitPrice) : null,
    status: t.status,
    createdAt: t.createdAt,
  };
}
