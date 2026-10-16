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
