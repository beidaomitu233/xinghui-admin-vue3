import { describe, expect, it, vi } from 'vitest';

import { isWechatAuthorizationUrl } from './wechat';

vi.mock('#/api/request', () => ({ requestClient: {} }));

describe('微信跳转地址', () => {
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
