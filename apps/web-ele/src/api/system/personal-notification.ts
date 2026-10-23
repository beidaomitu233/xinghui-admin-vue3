import { requestClient } from '#/api/request';

/** Owner and tenant are resolved by the backend from the current session. */
export type NotificationId = number | string;

export interface PersonalNotification {
  id: NotificationId;
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

export const listMyNotifications = async (params: {
  pageNum?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}) => {
  const page = await requestClient.get<
    Omit<PersonalNotificationPage, 'total'> & { total: number | string }
  >('/notifications', { params });
  const total = Number(page.total);
  if (
    (typeof page.total === 'string' && !/^\d+$/.test(page.total)) ||
    !Number.isSafeInteger(total) ||
    total < 0
  )
    throw new Error('Invalid notification count');
  return { ...page, total };
};

export const getMyNotification = (id: NotificationId) =>
  requestClient.get<PersonalNotification>(`/notifications/${id}`);

export const getMyUnreadCount = () =>
  requestClient.get<number | string>('/notifications/unread-count');

export const markMyNotificationRead = (id: NotificationId) =>
  requestClient.put(`/notifications/${id}/read`);

export const markMyNotificationsRead = (ids: NotificationId[]) =>
  requestClient.put<number>('/notifications/read', { ids });
