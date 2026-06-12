import { api } from './api';

// ===== Types =====

export interface BalanceInfo {
  balance: number;
  alertThreshold: number | null;
  recentTransactions: BillingTransaction[];
}

export interface BillingTransaction {
  id: string;
  userId: string;
  type: string;
  category: string;
  amount: number;
  balanceAfter: number;
  description: string;
  articleId?: string;
  aiOperationId?: string;
  platformPublishId?: string;
  quantity?: number;
  unitPrice?: number;
  status: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
}

export interface BillingConfig {
  id: string;
  category: string;
  itemKey: string;
  itemName: string;
  unitPrice: number;
  unit: string;
  isActive: boolean;
}

export interface CostEstimateBreakdownItem {
  item: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface CostEstimate {
  estimatedCost: number;
  breakdown: CostEstimateBreakdownItem[];
  sufficientBalance: boolean;
  currentBalance: number;
}

export interface TopUpRecord {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
  amount: number;
  creditsAdded: number;
  bonusCredits: number;
  paymentMethod: string;
  status: string;
  paidAt?: string;
  createdAt: string;
}

export interface TransactionSummary {
  totalSpent: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface AlertConfig {
  thresholdAmount: number | null;
  isEnabled: boolean;
  lastTriggeredAt?: string;
}

export interface BillingReport {
  period: { start: string; end: string };
  totalRevenue: number;
  totalConsumption: number;
  netChange: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
  topUsers: Array<{
    userId: string;
    userName: string;
    totalSpent: number;
  }>;
}

// ===== API Functions =====
//
// Backend response shapes (no global interceptor — controllers return raw):
//   Simple endpoints  → return value directly         → axios: res.data = <value>
//   Paginated endpoints → return { data, meta, summary? } → axios: res.data = { data, meta, ... }
//
// So: simple endpoints use `return res.data`, paginated endpoints use `return res.data`.

export async function getBalance(): Promise<BalanceInfo> {
  const res = await api.get('/billing/balance');
  return res.data;
}

export async function getTransactions(params?: {
  page?: number;
  pageSize?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
}): Promise<PaginatedResponse<BillingTransaction> & { summary: TransactionSummary }> {
  const res = await api.get('/billing/transactions', { params });
  return res.data;
}

export async function getTeamTransactions(params?: {
  page?: number;
  pageSize?: number;
  type?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<PaginatedResponse<BillingTransaction> & { summary: TransactionSummary }> {
  const res = await api.get('/billing/transactions/team', { params });
  return res.data;
}

export async function getBillingConfigs(): Promise<BillingConfig[]> {
  const res = await api.get('/billing/config');
  return res.data;
}

export async function updateBillingConfig(
  itemKey: string,
  data: { unitPrice: number; itemName?: string; isActive?: boolean },
): Promise<BillingConfig> {
  const res = await api.put(`/billing/config/${itemKey}`, data);
  return res.data;
}

export async function manualTopUp(data: {
  targetUserId: string;
  amount: number;
  reason?: string;
}): Promise<TopUpRecord> {
  const res = await api.post('/billing/top-up/manual', data);
  return res.data;
}

/**
 * 在线支付创建订单（支付宝 / 微信）。
 * 后端 controller 走 `dto.paymentMethod` 分发到 alipayService 或 wechatPayService。
 * 返回的 paymentUrl 是支付宝 PC 网页支付跳转 URL；qrCodeUrl 仅微信支付有值。
 */
export interface CreateOnlineTopUpInput {
  amount: number;
  paymentMethod: 'ALIPAY' | 'WECHAT_PAY';
  packageId?: string;
}

export interface CreateOnlineTopUpResult {
  topUpRecordId: string;
  paymentUrl: string;
  qrCodeUrl?: string;
}

export async function createOnlineTopUp(
  input: CreateOnlineTopUpInput,
): Promise<CreateOnlineTopUpResult> {
  const res = await api.post<CreateOnlineTopUpResult>('/billing/top-up/create', input);
  return res.data;
}

export async function getTopUpRecords(
  page?: number,
  pageSize?: number,
): Promise<PaginatedResponse<TopUpRecord>> {
  const res = await api.get('/billing/top-up/records', { params: { page, pageSize } });
  return res.data;
}

export async function estimateCost(data: {
  operationType: string;
  articleId?: string;
  platforms?: string[];
  estimatedTokens?: number;
  batchSize?: number;
}): Promise<CostEstimate> {
  const res = await api.post('/billing/estimate', data);
  return res.data;
}

export async function getAlertConfig(): Promise<AlertConfig> {
  const res = await api.get('/billing/alert');
  return res.data;
}

export async function updateAlertConfig(data: {
  thresholdAmount: number;
  isEnabled?: boolean;
}): Promise<AlertConfig> {
  const res = await api.put('/billing/alert', data);
  return res.data;
}

export async function createRefund(data: {
  originalTransactionId: string;
  reason: string;
  refundAmount?: number;
}): Promise<BillingTransaction> {
  const res = await api.post('/billing/refund', data);
  return res.data;
}

export async function getReport(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<BillingReport> {
  const res = await api.get('/billing/report', { params });
  return res.data;
}
