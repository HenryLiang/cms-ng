import { libT } from '@/i18n/client-dict';

// Shared transaction label helpers so 计费管理 and 账号管理 render identical
// labels for the same TransactionType / BillingCategory (single source of
// truth). Labels resolve via the lib catalog (libT reads the locale cookie).

export function getTransactionTypeLabel(type: string): string {
  return libT(`transaction.type.${type}`, undefined, type);
}

export function getTransactionCategoryLabel(category: string): string {
  return libT(`transaction.category.${category}`, undefined, category);
}
