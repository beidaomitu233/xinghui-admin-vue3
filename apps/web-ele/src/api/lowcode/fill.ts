import type { FormField, Submission } from './forms';

import { useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

export interface FillDefinition {
  title: string;
  schemaVersion: number;
  accessMode: 'login' | 'public';
  fields: Omit<FormField, 'listVisible' | 'searchable'>[];
}
export interface FillReceipt {
  submitted: boolean;
  receipt: string;
}
export class FillError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Filling has its own error handling: a required-login hint must not clear an unrelated admin session.
async function fillRequest<T>(
  token: string,
  body?: Pick<Submission, 'data' | 'schemaVersion'> & { requestKey: string },
): Promise<T> {
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  const access = useAccessStore();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (access.accessToken) headers.Authorization = access.accessToken;
  const response = await fetch(
    `${apiURL.replace(/\/$/u, '')}/lowcode/fill/${encodeURIComponent(token)}`,
    {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      credentials: 'same-origin',
    },
  );
  const result = await response.json().catch(() => undefined);
  if (!response.ok || result?.code !== 200)
    throw new FillError(
      response.status === 200 ? Number(result?.code || 400) : response.status,
      result?.message || '表单暂不可用，请稍后重试',
    );
  return result.data as T;
}
export const readFillForm = (token: string) =>
  fillRequest<FillDefinition>(token);
export const submitFillForm = (
  token: string,
  data: Pick<Submission, 'data' | 'schemaVersion'> & { requestKey: string },
) => fillRequest<FillReceipt>(token, data);
