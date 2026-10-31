import type { SessionUserInfo } from './session-info';

import { requestClient } from '#/api/request';

/**
 * 获取用户信息
 */
export async function getUserInfoApi(): Promise<SessionUserInfo> {
  const info = await requestClient.get<any>('/user/info');
  const permissions = Array.isArray(info.permissions) ? info.permissions : [];
  // 映射后端字段到前端需要的 UserInfo 接口
  return {
    ...info.user,
    realName: info.user?.nickname || info.user?.username,
    roles: info.roles?.map((r: any) => r.roleKey) || [],
    permissions,
    homePath: permissions.includes('ai:agent:invoke')
      ? '/ai/workbench'
      : info.user?.homePath || '/workspace',
  };
}
