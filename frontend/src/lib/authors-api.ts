import { api } from './api';

/** A single author persona shown in the author-style dropdown. */
export interface AuthorSummary {
  slug: string;
  name: string;
  fields: string[];
  bio: string;
}

/** Response shape of GET /authors. `source='fallback'` means no author data is
 *  available on disk and the app should hide/disable the picker. */
export interface AuthorSourceInfo {
  authors: AuthorSummary[];
  source: 'disk' | 'fallback';
  count: number;
  warning?: string;
}

/** Fetch the available author personas + data-source status. */
export async function getAuthors(): Promise<AuthorSourceInfo> {
  const res = await api.get('/authors');
  return res.data;
}
