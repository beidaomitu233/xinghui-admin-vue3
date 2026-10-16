import { requestClient } from '#/api/request';

export interface NewsRecord {
  id: string;
  [field: string]: null | number | string | undefined;
}
export interface NewsPage {
  records: NewsRecord[];
  total: number;
  pageNum: number;
  pageSize: number;
}
export interface NewsChange {
  title: string;
  summary: string;
  content: string;
  coverImage: string;
  category: string;
  tags: string;
  status: string;
}
export const listNews = async (params: {
  pageNum: number;
  pageSize: number;
  status?: string;
  title?: string;
}): Promise<NewsPage> => {
  const page = await requestClient.get<
    Omit<NewsPage, 'total'> & { total: number | string }
  >('/system/news', { params });
  return { ...page, total: Number(page.total) };
};
export const getNews = (id: string) =>
  requestClient.get<NewsRecord>(`/system/news/${encodeURIComponent(id)}`);
export const createNews = (data: NewsChange) =>
  requestClient.post<string>('/system/news', data);
export const updateNews = (id: string, data: NewsChange) =>
  requestClient.put<undefined>(`/system/news/${encodeURIComponent(id)}`, data);
export const removeNews = (id: string) =>
  requestClient.delete<undefined>(`/system/news/${encodeURIComponent(id)}`);
