import { api } from './api';

export async function getReviewQueue() {
  const { data } = await api.get('/articles/review-queue');
  return data;
}

export async function submitReview(
  articleId: string,
  decision: 'APPROVE' | 'REVISION',
  comment?: string,
) {
  const { data } = await api.patch(`/articles/${articleId}/review`, {
    decision,
    comment,
  });
  return data;
}
