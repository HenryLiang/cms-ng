/**
 * 日志脱敏:base64 数据与超长字符串绝不进日志(公共仓库,CI 日志全公开)。
 * 与 ai/providers/openai-compatible.provider.ts 中的私有实现同源;
 * 新模块统一从这里引用,旧模块的私有副本保持不动以减少改动面。
 */
const LOG_STRING_MAX = 8192;

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.includes(';base64,')) {
      return `[base64 data, ${value.length} chars redacted]`;
    }
    return value.length > LOG_STRING_MAX
      ? `${value.slice(0, LOG_STRING_MAX)}…[truncated, ${value.length} chars total]`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForLog(v);
    }
    return out;
  }
  return value;
}
