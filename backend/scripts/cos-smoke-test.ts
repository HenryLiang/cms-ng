/**
 * COS 真实连接 smoke test
 *
 * 读 backend/.env,实例化 CosStorageService,put 一个测试对象,
 * 验证 URL 公网可访问,然后 delete。
 *
 * 用法: cd backend && npx ts-node scripts/cos-smoke-test.ts
 */

import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { CosStorageService } from '../src/storage/cos-storage.service';

async function main() {
  // 1. 读 .env(用 dotenv,避免依赖 Nest 的 ConfigService 启动)
  const envPath = resolve(__dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf8');
  const parsed = dotenv.parse(envContent);
  console.log('[1/5] .env 已读取,字段数:', Object.keys(parsed).length);

  // 2. 校验 COS_* 必填项
  const required = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'];
  for (const k of required) {
    if (!parsed[k] || parsed[k].startsWith('<')) {
      throw new Error(`${k} 未配置或仍是占位符(${parsed[k]})`);
    }
  }
  console.log('[2/5] COS_* 必填项已配置');
  console.log('     BUCKET:', parsed.COS_BUCKET);
  console.log('     REGION:', parsed.COS_REGION);
  console.log('     SECRET_ID 前 8 字符:', parsed.COS_SECRET_ID.slice(0, 8) + '...');

  // 3. 实例化 CosStorageService
  const config = new ConfigService(parsed);
  const storage = new CosStorageService(config);
  console.log('[3/5] CosStorageService 实例化成功');

  // 4. put 一个测试 buffer
  const testKey = `cms-ng/smoke-test/${Date.now()}.txt`;
  const testBuffer = Buffer.from(`COS smoke test @ ${new Date().toISOString()}`);
  const { url } = await storage.put(testKey, testBuffer, 'text/plain');
  console.log('[4/5] put 成功');
  console.log('     key:', testKey);
  console.log('     url:', url);

  // 5. 验证公网可访问
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`公网 fetch 失败: HTTP ${res.status}`);
  }
  const body = await res.text();
  if (!body.includes('COS smoke test')) {
    throw new Error(`公网 fetch 内容不匹配: ${body.slice(0, 50)}`);
  }
  console.log('[5/5] 公网 fetch 成功,内容校验通过');
  console.log('');
  console.log('✅ 全部通过!COS 配置正确,凭据有效,bucket 可写可读');
  console.log('');
  console.log('后续:可以删除测试对象(留作历史也无所谓,很小):');
  console.log(`  await storage.delete('${testKey}')`);
}

main().catch((err) => {
  console.error('❌ 失败:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
