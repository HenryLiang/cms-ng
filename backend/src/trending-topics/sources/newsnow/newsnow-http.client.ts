/**
 * newsnow HTTP 客户端 -- 上游 server/utils/fetch.ts 的 `myFetch` 对应物。
 *
 * 语义与上游保持一致(基于 ofetch):自动按 Content-Type 解析 JSON/文本、
 * `query` 选项序列化查询串、默认 UA/超时/重试。差异(有意为之):
 * - retry 由 3 降为 1:上游跑在 Cloudflare Worker 无请求方等待,这里是
 *   NestJS 同步请求路径,3 次重试最坏 ~40s 会拖垮前端请求;单次重试 +
 *   adapter 层 TTL 缓存已够用。
 * - 新增按域名走 undici ProxyAgent 的能力:大陆开发环境访问海外源
 *   (HackerNews/GitHub/Solidot 等)需要代理,与 RssTopicSourceAdapter 的
 *   RSS_PROXY_ENABLED 模式对齐,但独立开关 NEWSNOW_PROXY_ENABLED。
 *   原生 fetch 不读 HTTP_PROXY,需显式挂 dispatcher(与 TwitterService 同法)。
 *
 * 配置通过 configureNewsnowClient() 注入(adapter 构造时调用),vendored
 * 源直接 import `myFetch`,保持上游调用形状。
 */
import { $fetch } from 'ofetch';
import { ProxyAgent } from 'undici';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** 大陆开发环境需走代理的海外源域名(NEWSNOW_PROXY_DOMAINS 可覆盖)。 */
export const DEFAULT_NEWSNOW_PROXY_DOMAINS = [
  'news.ycombinator.com',
  'github.com',
  'solidot.org',
  'aihot.virxact.com',
  // 大陆实测不可达(冒烟 2026-08-23):靠谱热搜、MKT快讯
  'kaopu.news',
  'api.mktnews.net',
];

interface NewsnowClientConfig {
  proxyEnabled: boolean;
  proxyUrl?: string;
  proxyDomains: Set<string>;
}

let clientConfig: NewsnowClientConfig = {
  proxyEnabled: false,
  proxyDomains: new Set(),
};

let proxyAgent: ProxyAgent | null = null;

/** adapter 启动时注入运行时配置(ConfigService 读 env)。 */
export function configureNewsnowClient(
  next: Partial<NewsnowClientConfig>,
): void {
  clientConfig = {
    ...clientConfig,
    ...next,
    proxyDomains: next.proxyDomains ?? clientConfig.proxyDomains,
  };
}

function getProxyAgent(): ProxyAgent | null {
  if (!clientConfig.proxyUrl) return null;
  if (!proxyAgent) {
    proxyAgent = new ProxyAgent(clientConfig.proxyUrl);
  }
  return proxyAgent;
}

function shouldProxy(url: string): boolean {
  if (!clientConfig.proxyEnabled || !clientConfig.proxyUrl) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  for (const domain of clientConfig.proxyDomains) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

/**
 * 自定义 fetch 传输:命中代理域名时挂 undici ProxyAgent dispatcher,
 * 其余直连。ofetch 会把它透传给原生 fetch。
 */
function newsnowFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const request = input instanceof Request ? input : input;
  if (shouldProxy(url)) {
    const agent = getProxyAgent();
    if (agent) {
      return globalThis.fetch(request, {
        ...init,
        // undici 专属 RequestInit 扩展,TS 类型未收录
        dispatcher: agent,
      } as RequestInit);
    }
  }
  return globalThis.fetch(request, init);
}

export const myFetch = $fetch.create(
  {
    timeout: 10_000,
    retry: 1,
    headers: { 'User-Agent': USER_AGENT },
  },
  // 第二参数是 globalOptions,ofetch 从这里取 fetch 实现
  // (放第一参数只会落进请求 options 被原生 fetch 忽略)
  { fetch: newsnowFetch },
);

/**
 * 取响应 Set-Cookie(国内平台先访问首页拿匿名 cookie 再调 API 的套路,
 * 上游 douyin/xueqiu 源使用)。失败时返回空数组,由调用方决定是否继续。
 */
export async function fetchResponseCookies(url: string): Promise<string[]> {
  try {
    const response = await myFetch.raw(url, { retry: 0, timeout: 8_000 });
    return response.headers.getSetCookie();
  } catch {
    return [];
  }
}

/** 测试专用:重置模块级状态。 */
export function resetNewsnowClientForTest(): void {
  clientConfig = { proxyEnabled: false, proxyDomains: new Set() };
  proxyAgent = null;
}
