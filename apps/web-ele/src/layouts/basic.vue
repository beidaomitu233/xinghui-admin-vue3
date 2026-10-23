<script lang="ts" setup>
import { computed, inject, provide, watch } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useWatermark } from '@vben/hooks';
import { BookOpenText, CircleHelp } from '@vben/icons';
import { BasicLayout, LockScreen, UserDropdown } from '@vben/layouts';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import PersonalNotificationEntry from '#/layouts/personal-notification-entry.vue';
import { localDefaultAsset } from '#/local-assets';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

import { documentationLinks } from './documentation';

const router = useRouter();
const userStore = useUserStore();
const namespace = inject<string>('app-namespace', 'xinghui');
provide(
  'navigation-expansion-key',
  computed(() => {
    const user = userStore.userInfo;
    return user?.userId
      ? `${namespace}-menu-groups:${encodeURIComponent(user.userId)}:${encodeURIComponent(String(user.tenantId ?? 'platform'))}`
      : '';
  }),
);
const authStore = useAuthStore();
const accessStore = useAccessStore();
const { destroyWatermark, updateWatermark } = useWatermark();
const docs = computed(() =>
  documentationLinks(
    router.currentRoute.value.path,
    import.meta.env.VITE_DOCS_URL,
  ),
);

const menus = computed(() => [
  {
    handler: () => {
      router.push({ name: 'Profile' });
    },
    icon: 'lucide:user',
    text: $t('page.auth.profile'),
  },
  {
    handler: () => {
      openWindow(docs.value.home, { target: '_blank' });
    },
    icon: BookOpenText,
    text: '文档中心',
  },
  {
    handler: () => {
      openWindow(docs.value.help, { target: '_blank' });
    },
    icon: CircleHelp,
    text: '当前页面帮助',
  },
  {
    handler: () => {
      openWindow(docs.value.versions, { target: '_blank' });
    },
    icon: BookOpenText,
    text: '版本说明',
  },
]);

const avatar = computed(() => {
  return localDefaultAsset(
    userStore.userInfo?.avatar || preferences.app.defaultAvatar,
    'avatar',
  );
});

async function handleLogout() {
  await authStore.logout(false);
}

watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
  }),
  async ({ enable, content }) => {
    if (enable) {
      await updateWatermark({
        content:
          content ||
          `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
      });
    } else {
      destroyWatermark();
    }
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <BasicLayout @clear-preferences-and-logout="handleLogout">
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.realName"
        :description="userStore.userInfo?.email || ''"
        tag-text=""
        @logout="handleLogout"
      />
    </template>
    <template #notification>
      <component :is="PersonalNotificationEntry" />
    </template>
    <template #extra>
      <AuthenticationLoginExpiredModal
        v-model:open="accessStore.loginExpired"
        :avatar
      >
        <LoginForm />
      </AuthenticationLoginExpiredModal>
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
</template>
