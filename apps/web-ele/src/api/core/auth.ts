import { requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    phone: string;
    password: string;
    code?: string;
    uuid?: string;
    smsRequestId?: string;
    smsCode?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  const token = data.smsRequestId
    ? await requestClient.post<string>('/auth/sms/login', {
        phone: data.phone,
        requestId: data.smsRequestId,
        code: data.smsCode,
      })
    : await requestClient.post<string>('/user/login', data);
  return { accessToken: token };
}
export const getSmsLoginCapability = () =>
  requestClient.get<{ available: boolean }>('/auth/sms/capability');
export const sendSmsLoginCode = (data: {
  code?: string;
  phone: string;
  uuid?: string;
}) =>
  requestClient.post<{
    expiresInSeconds: number;
    requestId: string;
    retryAfterSeconds: number;
  }>('/auth/sms/code', data);

/**
 * 退出登录
 */
export async function logoutApi() {
  return requestClient.post('/user/logout');
}

export interface CaptchaResult {
  enabled: boolean;
  img: string;
  uuid: string;
}

export async function getCaptchaApi() {
  return requestClient.get<CaptchaResult>('/captcha');
}
