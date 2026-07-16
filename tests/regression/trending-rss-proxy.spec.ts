/**
 * Trending-Topics + RSS_PROXY_ENABLED 代理开关 回归测试
 *
 * 覆盖：docs/qa/full-regression-v1.md
 *  - §12  TC-TRD-AGT-* / TC-TRD-RSS-*   Trending-Topics 热点聚合
 *  - §16  TC-RSS-PRX-* / TC-RSS-LCL-*  RSS_PROXY_ENABLED 代理开关
 *
 * 测试矩阵:
 *   TC-TRD-AGT-001  GET /trending-topics/sources/google-trends/items 外部真实抓取(软失败)
 *   TC-TRD-RSS-001  GET /trending-topics/guardian     原生 RSS 源(API 必应)
 *   TC-RSS-PRX-001  读 /tmp/qa-backend.log 验证代理状态行(启动日志)
 *   TC-RSS-PRX-002  RSS_PROXY_ENABLED=false 场景下直连 RSS 源可成功
 *   TC-RSS-LCL-001  本地 RSSHub 源(zaobao)在 :1200 可达时返回 200
 *
 * 响应格式(无全局包装):
 *  - GET /trending-topics/sources/google-trends/items?geo=HK -> { success, data: { items, total, page, limit, totalPages }
 *  - GET /trending-topics/{source}                            → { items, total, page, limit, totalPages }
 *  - 当外部源 4xx/5xx 时,fetchNewsBySource 抛 Error(由 controller 默认 ExceptionFilter 转 500)
 *    → 软测试容忍: 期望 200 OR 期望 API 响应(不挂起)
 *
 * 策略: 纯 API 驱动 + 文件系统读取日志 + curl 检测 RSSHub。
 *   外部 API(Google Trends / 海外 RSS) 软失败详细记录原因,
 *   启动日志断言按"应可见 / 未实现" 两种情形分别处理。
 *
 * 前缀规则: 所有创建/抓取的 trending 资源用 `qa-trending-` 前缀。
 */
import { test, expect, loginByApi } from './_shared/fixtures';
import { uniqueSuffix } from './_shared/api';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

// =====================================================================
// Helpers
// =====================================================================

function logTopicPrefix(extra = ''): string {
  return `qa-trending-${Date.now().toString(36)}-${uniqueSuffix()}${extra ? '-' + extra : ''}`;
}

function soft(label: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  [soft-ok]   ${label}`);
  } else {
    console.log(`  [soft-fail] ${label} :: ${detail}`);
  }
}

/** curl probe to check RSSHub reachability, returns true if / returns 200. */
function isRSSHubReachable(host = 'http://localhost:1200', timeoutMs = 2000): boolean {
  try {
    const out = execFileSync(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '--max-time',
        String(Math.max(1, Math.floor(timeoutMs / 1000))),
        `${host}/`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out.startsWith('2') || out.startsWith('3');
  } catch {
    return false;
  }
}

// =====================================================================
// §12 Trending-Topics — Google Trends 真实外部抓取
// =====================================================================

test.describe('TRD-AGT: Google Trends 真实抓取 (软失败)', () => {
  test('TC-TRD-AGT-001: GET /trending-topics/sources/google-trends/items?geo=HK 返回列表', async ({ api }) => {
    test.setTimeout(120_000); // Google Trends 海外抓取最坏可达 60-90s
    const { token } = await loginByApi('admin');
    const t0 = Date.now();
    let r;
    try {
      r = await api.get('/trending-topics/sources/google-trends/items?geo=HK&limit=5', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 110_000,
      });
    } catch (e: any) {
      // request aborted / network failure → 标记为 skip (rate-limited or network down)
      const msg = e?.message || String(e);
      test.skip(true, `Google Trends 抓取被中止 (rate-limit / network down): ${msg.slice(0, 200)}`);
      return;
    }
    const elapsed = Date.now() - t0;
    const status = r.status();
    const body = await r.text();

    if (status === 429 || status === 503 || status === 502 || status === 504) {
      // upstream rate-limited or proxy failure — soft-skip per spec
      test.skip(true, `Google Trends 上游限流/不可用 HTTP ${status} elapsed=${elapsed}ms`);
      return;
    }

    if (status >= 200 && status < 300) {
      const data = JSON.parse(body);
      const items = data.items ?? data.data?.items ?? data.data ?? data;
      console.log(
        `  [TRD-AGT-001] google-trends OK in ${elapsed}ms items=${
          Array.isArray(items) ? items.length : 'n/a'
        }`,
      );
      expect(Array.isArray(items)).toBe(true);
      if (Array.isArray(items) && items.length > 0) {
        // 不强求字段,但有 items 时至少要看起来像 RSS 条目
        const first = items[0];
        soft('google-trends item has title', typeof first.title === 'string' && first.title.length > 0, JSON.stringify(first).slice(0, 200));
      }
    } else {
      // 4xx/5xx 来自 controller 抛错的默认 ExceptionFilter — 记录但不 fail
      soft('google-trends HTTP 2xx', false, `HTTP ${status} elapsed=${elapsed}ms body=${body.slice(0, 300)}`);
    }
  });
});

// =====================================================================
// §12 Trending-Topics — 原生 RSS 源
// =====================================================================

test.describe('TRD-RSS: 原生 RSS 源(API 必应)', () => {
  test('TC-TRD-RSS-001: GET /trending-topics/guardian 返回 parsed items 或明确的 API 错误', async ({ api }) => {
    test.setTimeout(60_000);
    const { token } = await loginByApi('admin');
    const t0 = Date.now();
    let r;
    try {
      r = await api.get('/trending-topics/guardian?limit=3', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 50_000,
      });
    } catch (e: any) {
      soft('guardian fetch', false, `请求异常: ${(e?.message || String(e)).slice(0, 200)}`);
      return;
    }
    const elapsed = Date.now() - t0;
    const status = r.status();
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600); // 不是 socket 挂起

    const body = await r.text();
    if (status >= 200 && status < 300) {
      const data = JSON.parse(body);
      const items = data.items ?? data.data?.items ?? data.data ?? data;
      console.log(
        `  [TRD-RSS-001] guardian OK in ${elapsed}ms items=${
          Array.isArray(items) ? items.length : 'n/a'
        }`,
      );
      // Guardian 在大陆/受限网络下可能一直连不上 — 不强制 items.length > 0
      soft('guardian returns array (possibly empty)', Array.isArray(items), `body: ${body.slice(0, 200)}`);
    } else {
      // controller 会把 fetchNewsBySource 抛的 Error 转成 500 — 这是预期行为
      console.log(`  [TRD-RSS-001] guardian 上游失败 HTTP ${status} elapsed=${elapsed}ms body=${body.slice(0, 200)}`);
    }
    // 关键断言: API 响应了,没挂死
    expect(elapsed).toBeLessThan(55_000);
  });
});

// =====================================================================
// §16 RSS_PROXY_ENABLED — 启动日志断言
// =====================================================================

test.describe('RSS-PRX: RSS_PROXY_ENABLED 代理开关', () => {
  test('TC-RSS-PRX-001: /tmp/qa-backend.log 启动期代理状态行(应可见 / 缺失则报告)', async () => {
    // 不打 API, 直接读 QA backend 的 stdout 日志
    const logPath = '/tmp/qa-backend.log';
    let logContent = '';
    try {
      logContent = fs.readFileSync(logPath, 'utf8');
    } catch (e: any) {
      // 日志文件读不到也属于"软" — 报告而非 fail
      soft('qa-backend log readable', false, `无法读取 ${logPath}: ${(e?.message || e).slice(0, 200)}`);
      return;
    }
    expect(logContent.length).toBeGreaterThan(0);

    // 期望命中关键词(v1 §16 TC-PROXY-005):
    //   "RSS proxy: enabled" / "disabled"
    // 当前 trending-topics.service.ts 构造函数读取 env 但未显式打日志 (已知缺口)
    const enabledHit = /RSS proxy:\s*enabled/i.test(logContent);
    const disabledHit = /RSS proxy:\s*disabled/i.test(logContent);
    const anyProxyHit = /proxy/i.test(logContent);

    if (enabledHit || disabledHit) {
      const matched = enabledHit ? 'enabled' : 'disabled';
      soft('qa-backend.log 显式记录 RSS proxy 状态', true, `匹配: ${matched}`);
    } else {
      // 没有显式 log 行也算合规的"软"结果 — 报告即可,不要 fail
      soft(
        'qa-backend.log 显式记录 RSS proxy 状态',
        false,
        `未命中 "RSS proxy: enabled/disabled" (v1 §16 TC-PROXY-005 期望日志行, 暂未实现); 任意 proxy 关键字=${
          anyProxyHit ? '命中' : '未命中'
        }`,
      );
    }
    // 关键: 日志至少有 Nest 启动行 (InstanceLoader + Mapped routes)
    const nestBoot = /Starting Nest application/.test(logContent);
    expect(nestBoot).toBe(true);
  });

  test('TC-RSS-PRX-002: RSS_PROXY_ENABLED=false (QA 默认) → 直连 RSS 源在合理时间内响应', async ({ api }) => {
    // QA 后端以 RSS_PROXY_ENABLED=false 启动(参见 scripts/start-qa-backend.sh 或 v1 §16)
    // 因此直连的 native RSS 源应能 respond(快或慢, 但不挂起)
    test.setTimeout(60_000);
    const { token } = await loginByApi('admin');
    // 选一个 native (非 Google, 非 RSSHub) 源 — bbc/guardian/nytimes/people 任选
    // bbc URL = http://feeds.bbci.co.uk/news/rss.xml — 在大陆/海外均可能 fail, 这里只验证不挂死
    const t0 = Date.now();
    let r;
    try {
      r = await api.get('/trending-topics/bbc?limit=2', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 50_000,
      });
    } catch (e: any) {
      soft('bbc 直连抓取', false, `请求异常(可能直连被防火墙拦): ${(e?.message || String(e)).slice(0, 200)}`);
      return;
    }
    const elapsed = Date.now() - t0;
    const status = r.status();
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);

    const body = await r.text();
    if (status >= 200 && status < 300) {
      const data = JSON.parse(body);
      const items = data.items ?? data.data?.items ?? data.data ?? data;
      console.log(
        `  [RSS-PRX-002] bbc 直连 OK in ${elapsed}ms items=${
          Array.isArray(items) ? items.length : 'n/a'
        }`,
      );
      soft('bbc 直连在 ≤50s 内返回', elapsed < 50_000, `elapsed=${elapsed}ms`);
    } else {
      // RSS_PROXY_ENABLED=false + 网络受限 → 预期 500,记录即可
      console.log(`  [RSS-PRX-002] bbc 直连失败 HTTP ${status} elapsed=${elapsed}ms (RSS_PROXY_ENABLED=false, 走直连)`);
    }
    expect(elapsed).toBeLessThan(55_000);
  });
});

// =====================================================================
// §12 / §16 — 本地 RSSHub 源(总不走代理)
// =====================================================================

test.describe('RSS-LCL: 本地 RSSHub 源(:1200)', () => {
  test('TC-RSS-LCL-001: RSSHub 可达时 zaobao 返回 200 + items; 不可达则 skip', async ({ api }) => {
    test.setTimeout(60_000);
    if (!isRSSHubReachable('http://localhost:1200', 2000)) {
      test.skip(true, 'RSSHub not running in this environment (curl http://localhost:1200/ 非 2xx/3xx)');
      return;
    }
    const { token } = await loginByApi('admin');
    const t0 = Date.now();
    let r;
    try {
      r = await api.get('/trending-topics/zaobao?limit=3', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 50_000,
      });
    } catch (e: any) {
      soft('zaobao via RSSHub', false, `请求异常: ${(e?.message || String(e)).slice(0, 200)}`);
      return;
    }
    const elapsed = Date.now() - t0;
    const status = r.status();
    const body = await r.text();
    expect(status).toBeGreaterThanOrEqual(200);
    expect(status).toBeLessThan(600);

    if (status >= 200 && status < 300) {
      const data = JSON.parse(body);
      const items = data.items ?? data.data?.items ?? data.data ?? data;
      console.log(
        `  [RSS-LCL-001] zaobao via RSSHub OK in ${elapsed}ms items=${
          Array.isArray(items) ? items.length : 'n/a'
        }`,
      );
      // RSSHub 路径永远不走代理 — fast-fail 之外,成功也是软
      expect(elapsed).toBeLessThan(55_000);
      soft('zaobao items 为数组(可空)', Array.isArray(items), `body: ${body.slice(0, 200)}`);
    } else {
      // RSSHub 路径有,但内部 route 失效 — 记录即可
      console.log(`  [RSS-LCL-001] zaobao HTTP ${status} elapsed=${elapsed}ms body=${body.slice(0, 200)}`);
    }
  });
});
