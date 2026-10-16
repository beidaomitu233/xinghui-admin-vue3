import { requestClient } from '#/api/request';

/** Owner and tenant are resolved by the backend from the current session. */
export interface PersonalNotification {
  id: number;
  eventCode: string;
  eventKey: string;
  title: string;
  body: string;
  target: null | string;
  createTime: string;
  readTime: null | string;
}

export interface PersonalNotificationPage {
  items: PersonalNotification[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export const listMyNotifications = (params: {
  pageNum?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}) => requestClient.get<PersonalNotificationPage>('/notifications', { params });

export const getMyNotification = (id: number) =>
  requestClient.get<PersonalNotification>(`/notifications/${id}`);

export const getMyUnreadCount = () =>
  requestClient.get<number | string>('/notifications/unread-count');

export const markMyNotificationRead = (id: number) =>
  requestClient.put(`/notifications/${id}/read`);

export const markMyNotificationsRead = (ids: number[]) =>
  requestClient.put<number>('/notifications/read', { ids });
