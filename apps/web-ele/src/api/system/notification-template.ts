import { requestClient } from '#/api/request';

export interface NotificationTemplate {
  id: number;
  eventCode: string;
  name: string;
  titleTemplate: string;
  bodyTemplate: string;
  targetTemplate?: null | string;
  allowedVariables: string[];
  enabled: boolean;
}

export type TemplateCreate = Omit<NotificationTemplate, 'id'>;
export type TemplateEdit = Omit<TemplateCreate, 'eventCode'>;

export const listNotificationTemplates = () =>
  requestClient.get<NotificationTemplate[]>('/system/notification/templates');

export const createNotificationTemplate = (data: TemplateCreate) =>
  requestClient.post<number>('/system/notification/templates', data);

export const updateNotificationTemplate = (id: number, data: TemplateEdit) =>
  requestClient.put(`/system/notification/templates/${id}`, data);
