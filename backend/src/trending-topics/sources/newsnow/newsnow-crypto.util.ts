/**
 * 摘要工具 -- 替代上游 newsnow 的 server/utils/crypto.ts(uncrypto + md5
 * 两个依赖),改用 Node 内置 node:crypto。
 * 目前仅财联社签名使用:sign = md5(sha1Hex(排序后参数串))。
 */
import { createHash } from 'node:crypto';

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export function md5Hex(input: string): string {
  return createHash('md5').update(input).digest('hex');
}
