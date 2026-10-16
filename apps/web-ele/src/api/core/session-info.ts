import type { UserInfo } from '@vben/types';

export type SessionUserInfo = UserInfo & {
  email?: null | string;
  mobile?: null | string;
  nickname?: null | string;
  permissions: string[];
};

/** 每次读取本人信息后，用服务端当前权限覆盖本地持久化权限。 */
export async function restoreUserSession(
  fetchInfo: () => Promise<SessionUserInfo>,
  setUserInfo: (info: UserInfo) => void,
  setAccessCodes: (codes: string[]) => void,
): Promise<SessionUserInfo> {
  const info = await fetchInfo();
  setUserInfo(info);
  setAccessCodes(info.permissions);
  return info;
}
