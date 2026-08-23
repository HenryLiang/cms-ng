/**
 * 财联社签名参数 -- 移植自 newsnow server/sources/cls/utils.ts
 * (https://github.com/ourongxing/newsnow, MIT License,原始出处 RSSHub)。
 * 偏差:md5/myCrypto(uncrypto)替换为 Node 内置 node:crypto。
 * 注意签名是两层:md5(sha1Hex(排序后参数串)),漏掉外层 md5 会报
 * errno 10012 签名错误(冒烟实测)。
 */
import { md5Hex, sha1Hex } from '../newsnow-crypto.util';

const params = {
  appName: 'CailianpressWeb',
  os: 'web',
  sv: '7.7.5',
};

export function getClsSearchParams(
  moreParams?: Record<string, string | number>,
): URLSearchParams {
  const searchParams = new URLSearchParams({
    ...params,
    ...(moreParams ?? {}),
  });
  searchParams.sort();
  searchParams.append('sign', md5Hex(sha1Hex(searchParams.toString())));
  return searchParams;
}
