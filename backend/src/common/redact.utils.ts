/**
 * 连接串/凭证脱敏工具(单一事实源)。
 *
 * P0 红线:本仓库为公开仓库,CI 日志全公开。任何连接串(DATABASE_URL /
 * ELASTICSEARCH_NODE / ...)都严禁打印含凭证的明文——GitHub 的打码不可依赖。
 */

/**
 * 剥离 URL 中的 userinfo(用户名:密码),供日志/错误信息安全打印。
 *
 * 贪婪匹配到最后一个 `@`,容忍密码中未 URL 编码的 `@`:
 *   `http://user:p@ss@host:9200` -> `http://***@host:9200`
 *   `mysql://root:secret@db:3306/x` -> `mysql://***@db:3306/x`
 *   无 userinfo 时原样返回。
 */
export function redactConnectionString(url: string): string {
  return url.replace(/\/\/[^/]*@/, '//***@');
}
