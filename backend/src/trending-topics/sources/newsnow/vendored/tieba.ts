/**
 * 百度贴吧热议 -- 移植自 newsnow server/sources/tieba.ts
 * (https://github.com/ourongxing/newsnow, MIT License)。
 * 偏差:defineSource 包装替换为具名导出。
 */
import { myFetch } from '../newsnow-http.client';
import type { NewsItem } from '../newsnow.types';

interface Res {
  data: {
    bang_topic: {
      topic_list: {
        topic_id: string;
        topic_name: string;
        create_time: number;
        topic_url: string;
      }[];
    };
  };
}

export async function fetchTiebaHot(): Promise<NewsItem[]> {
  const url = 'https://tieba.baidu.com/hottopic/browse/topicList';
  const res: Res = await myFetch(url);
  return res.data.bang_topic.topic_list.map((k) => {
    return {
      id: k.topic_id,
      title: k.topic_name,
      url: k.topic_url,
    };
  });
}
