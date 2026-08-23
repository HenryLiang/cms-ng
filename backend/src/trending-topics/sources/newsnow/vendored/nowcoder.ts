/**
 * 牛客热搜 -- 移植自 newsnow server/sources/nowcoder.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出;上游 map 里 url/id 可能为
 * undefined(type 未命中分支),这里显式过滤保类型。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    result: {
      id: string;
      title: string;
      type: number;
      uuid: string;
    }[];
  };
}

export async function fetchNowcoderHot(): Promise<NewsItem[]> {
  const timestamp = Date.now();
  const url = `https://gw-c.nowcoder.com/api/sparta/hot-search/top-hot-pc?size=20&_=${timestamp}&t=`;
  const res: Res = await myFetch(url);
  return res.data.result.flatMap((k): NewsItem[] => {
    if (k.type === 74) {
      return [
        {
          id: k.uuid,
          title: k.title,
          url: `https://www.nowcoder.com/feed/main/detail/${k.uuid}`,
        },
      ];
    }
    if (k.type === 0) {
      return [
        {
          id: k.id,
          title: k.title,
          url: `https://www.nowcoder.com/discuss/${k.id}`,
        },
      ];
    }
    return [];
  });
}
