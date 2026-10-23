import { describe, expect, it, vi } from 'vitest';

import {
  isWechatAuthorizationUrl,
  isWechatLoginUrl,
  safeWechatReturn,
} from './wechat';

vi.mock('#/api/request', () => ({ requestClient: {} }));

describe('微信跳转地址', () => {
  it('分别校验网站与微信内授权范围，并限制业务返回页面', () => {
    expect(
      isWechatLoginUrl(
        'https://open.weixin.qq.com/connect/oauth2/authorize?scope=snsapi_base',
        'mp',
      ),
    ).toBe(true);
    expect(
      isWechatLoginUrl(
        'https://open.weixin.qq.com/connect/oauth2/authorize?scope=snsapi_login',
        'mp',
      ),
    ).toBe(false);
    expect(
      isWechatLoginUrl(
        'https://open.weixin.qq.com/connect/qrconnect?scope=snsapi_base',
        'website',
      ),
    ).toBe(false);
    expect(safeWechatReturn('/ai/conversation?draft=42')).toBe(
      '/ai/conversation?draft=42',
    );
    for (const target of [
      '/workspace',
      '/analytics?period=week',
      '/lowcode/records?formId=42',
      '/lowcode/fill/42?draft=hello%20world',
    ])
      expect(safeWechatReturn(target)).toBe(target);
    for (const target of [
      '//evil.example',
      'https://evil.example',
      '/auth/login',
      '/ai/%2f%2fevil',
      '/ai/../auth',
      '/ai/x#//evil',
    ])
      expect(safeWechatReturn(target)).toBe('/');
  });
  it('只接受微信网站授权端点', () => {
    expect(
      isWechatAuthorizationUrl(
        'https://open.weixin.qq.com/connect/qrconnect?scope=snsapi_login',
      ),
    ).toBe(true);
    for (const value of [
      'javascript:alert(1)',
      'https://open.weixin.qq.com.attacker.test/connect/qrconnect?scope=snsapi_login',
      'https://open.weixin.qq.com/connect/oauth2/authorize?scope=snsapi_login',
    ])
      expect(isWechatAuthorizationUrl(value)).toBe(false);
  });
});
