import { defineOverridesPreferences } from '@vben/preferences';

import { localAvatar, localLogo } from './local-assets';

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * 项目偏好升级通过定向迁移兼容旧缓存，无需用户清缓存。
 */
export const overridesPreferences = defineOverridesPreferences({
  navigation: { accordion: false },
  logo: { source: localLogo },
  // overrides
  app: {
    defaultAvatar: localAvatar,
    name: import.meta.env.VITE_APP_TITLE,
    // 使用后端动态路由模式
    accessMode: 'backend',
    enableRefreshToken: false,
    loginExpiredMode: 'page',
    // 登录后默认跳转路径
    defaultHomePath: '/workspace',
  },
});
