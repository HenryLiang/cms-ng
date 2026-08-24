/**
 * newsnow 源冒烟测试 -- 逐源真实外呼(Phase 0 可达性 PoC)。
 *
 * 用法(backend 目录):
 *   npx ts-node scripts/newsnow-smoke.ts            # 全部源直连
 *   npx ts-node scripts/newsnow-smoke.ts --proxy    # 海外源走 HTTP_PROXY 代理
 *   npx ts-node scripts/newsnow-smoke.ts --only newsnow-toutiao,newsnow-cls-telegraph
 *
 * 输出逐源结果表(条数/耗时/错误),退出码:全部通过 0,任一失败 1。
 * 这是本机可达性验证,不代表海外生产机房的网络结论(需在 prod 机器上跑)。
 *
 * 注意:tophub 镜像榜(11 个,如 newsnow-xiaohongshu、newsnow-wechat-hot)经
 * RSSHub /tophub/:id 路由,冒烟前需保证 RSSHub 容器在跑且本机可达(读取
 * .env 的 RSS_HUB_URL,缺省 http://localhost:1200)。compose-prod 栈里
 * RSSHub 只在内部网络 expose,这些源请在 backend 容器内验证,宿主机上
 * 跑出 ECONNREFUSED 属预期,不要因此把它们裁出白名单。
 */
import * as dotenv from 'dotenv';
import {
  configureNewsnowClient,
  DEFAULT_NEWSNOW_PROXY_DOMAINS,
} from '../src/trending-topics/sources/newsnow/newsnow-http.client';
import {
  NEWSNOW_SOURCE_ENTRIES,
  NewsnowSourceEntry,
} from '../src/trending-topics/sources/newsnow/newsnow-source.registry';

dotenv.config();

interface SourceResult {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

async function run(): Promise<number> {
  const useProxy = process.argv.includes('--proxy');
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
  const only = onlyArg
    ? onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  // 经 RSSHub 路由的源(newsnow-xiaohongshu):注入 RSS_HUB_URL(.env/env),
  // 缺省 localhost:1200
  configureNewsnowClient({ rssHubUrl: process.env.RSS_HUB_URL });

  if (useProxy) {
    const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
    if (!proxyUrl) {
      console.error('--proxy 需要设置 HTTP_PROXY 环境变量');
      return 2;
    }
    configureNewsnowClient({
      proxyEnabled: true,
      proxyUrl,
      proxyDomains: new Set(DEFAULT_NEWSNOW_PROXY_DOMAINS),
    });
    console.log(
      `代理已启用: ${proxyUrl} (域名: ${DEFAULT_NEWSNOW_PROXY_DOMAINS.join(', ')})\n`,
    );
  }

  const entries: NewsnowSourceEntry[] = NEWSNOW_SOURCE_ENTRIES.filter(
    (entry) => !only || only.includes(entry.id),
  );

  const results: SourceResult[] = [];
  // 串行执行:避免并发触发各平台反爬限流,结果更接近真实单源表现
  for (const entry of entries) {
    process.stdout.write(`抓取 ${entry.label} (${entry.id}) ... `);
    const start = Date.now();
    try {
      const items = await entry.getter();
      const valid = items.filter(
        (item) => item.title?.trim() && item.url,
      ).length;
      const result: SourceResult = {
        id: entry.id,
        label: entry.label,
        ok: items.length > 0,
        count: items.length,
        ms: Date.now() - start,
        error: items.length
          ? valid < items.length
            ? `${valid}/${items.length} 条字段不完整`
            : undefined
          : '返回空列表',
      };
      results.push(result);
      console.log(
        result.ok
          ? `OK ${items.length} 条, ${result.ms}ms${result.error ? ` (${result.error})` : ''}`
          : `EMPTY, ${result.ms}ms`,
      );
    } catch (error) {
      const message = (error as Error).message.slice(0, 100);
      results.push({
        id: entry.id,
        label: entry.label,
        ok: false,
        count: 0,
        ms: Date.now() - start,
        error: message,
      });
      console.log(`FAIL: ${message}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n========== 汇总: ${passed}/${results.length} 通过 ==========`);
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.log('\n失败源(生产白名单 NEWSNOW_SOURCES 可先裁掉):');
    for (const failure of failures) {
      console.log(
        `  ${failure.id.padEnd(28)} ${failure.label.padEnd(12)} ${failure.error}`,
      );
    }
  }
  return failures.length ? 1 : 0;
}

run()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('smoke 脚本异常:', error);
    process.exit(2);
  });
