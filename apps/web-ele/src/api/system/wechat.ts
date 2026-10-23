import { requestClient } from '#/api/request';

export interface WechatConfig {
  enabled: boolean;
  clientId: string;
  secretEnvName: string;
  callbackUri: string;
  revision: number;
  secretAvailable: boolean;
}
export interface WechatCapability {
  enabled: boolean;
  available: boolean;
  reason: string;
}
export const getWechatConfig = () =>
  requestClient.get<WechatConfig>('/system/wechat/config');
export const saveWechatConfig = (data: Omit<WechatConfig, 'secretAvailable'>) =>
  requestClient.put<WechatConfig>('/system/wechat/config', data);
export const getWechatCapability = () =>
  requestClient.get<WechatCapability>('/auth/wechat/capability');
export const startWechatAuthorization = () =>
  requestClient.post<{ authorizationUrl: string; expiresInSeconds: number }>(
    '/auth/wechat/authorize',
  );

export function isWechatAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://open.weixin.qq.com' &&
      url.pathname === '/connect/qrconnect' &&
      url.searchParams.get('scope') === 'snsapi_login'
    );
  } catch {
    return false;
  }
}

export const WECHAT_FLOW_KEY = 'xinghui.wechat.flow';
export interface WechatFlowStatus {
  status:
    | 'CANCELLED'
    | 'COMPLETED'
    | 'EXPIRED'
    | 'FAILED'
    | 'READY_BIND'
    | 'READY_LOGIN'
    | 'WAITING';
  returnPath: string;
  expiresInSeconds: number;
}
export const getWechatLoginCapability = () =>
  requestClient.get<{ mp: boolean; website: boolean }>(
    '/auth/wechat/login-capability',
  );
export const startWechatLogin = (
  channel: 'mp' | 'website',
  returnPath: string,
) =>
  requestClient.post<{
    authorizationUrl: string;
    expiresInSeconds: number;
    flow: string;
  }>('/auth/wechat/flow', { channel, returnPath });
export const getWechatFlow = (flow: string) =>
  requestClient.get<WechatFlowStatus>('/auth/wechat/flow/status', {
    params: { flow },
  });
export const cancelWechatFlow = (flow: string) =>
  requestClient.post('/auth/wechat/flow/cancel', { flow });
export const bindWechatFlow = (flow: string) =>
  requestClient.post<WechatFlowStatus>('/auth/wechat/flow/bind', { flow });
export const completeWechatFlow = (flow: string) =>
  requestClient.post<{ accessToken: string; returnPath: string }>(
    '/auth/wechat/flow/complete',
    { flow },
  );
export function isWechatLoginUrl(
  value: string,
  channel: 'mp' | 'website',
): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://open.weixin.qq.com' &&
      url.pathname ===
        (channel === 'mp'
          ? '/connect/oauth2/authorize'
          : '/connect/qrconnect') &&
      (channel === 'mp'
        ? ['snsapi_base', 'snsapi_userinfo']
        : ['snsapi_login']
      ).includes(url.searchParams.get('scope') ?? '')
    );
  } catch {
    return false;
  }
}
export function safeWechatReturn(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\\#]/u.test(value) ||
    [...value].some(
      (char) => (char.codePointAt(0) ?? 0) < 32 || char.codePointAt(0) === 127,
    )
  )
    return '/';
  try {
    const url = new URL(value, 'https://return.invalid');
    const path = value.split('?')[0] ?? '';
    return url.origin === 'https://return.invalid' &&
      /^\/[\w/.-]*$/iu.test(path) &&
      url.pathname === path &&
      !path.includes('//') &&
      !path.split('/').some((part) => part === '.' || part === '..') &&
      !['/api', '/auth', '/login'].includes(path) &&
      !path.startsWith('/auth/') &&
      !path.startsWith('/api/')
      ? value
      : '/';
  } catch {
    return '/';
  }
}
