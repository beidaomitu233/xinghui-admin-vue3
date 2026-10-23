<script setup lang="ts">
import type { SessionUserInfo } from '#/api/core/session-info';

import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElDescriptions,
  ElDescriptionsItem,
} from 'element-plus';

import { useAuthStore } from '#/store';

const access = useAccessStore();
const users = useUserStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const info = ref<SessionUserInfo>();
const loading = ref(false);
const failed = ref(false);
let requestId = 0;
const display = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : '未设置';
async function load() {
  if (loading.value || !access.accessToken) return;
  const id = ++requestId;
  const token = access.accessToken;
  loading.value = true;
  failed.value = false;
  info.value = undefined;
  try {
    const result = await auth.fetchUserInfo();
    if (!access.isAccessChecked) {
      await router.replace({
        path: route.path,
        query: route.query,
        hash: route.hash,
        force: true,
      });
      if (!access.isAccessChecked) throw new Error('个人信息初始化未完成');
    }
    if (
      id === requestId &&
      token === access.accessToken &&
      access.isAccessChecked
    ) {
      info.value = result;
    }
  } catch {
    if (id === requestId && token === access.accessToken) {
      failed.value = true;
      users.setUserInfo(null);
      access.setAccessCodes([]);
    }
  } finally {
    if (id === requestId) loading.value = false;
  }
}
watch(
  () => access.accessToken,
  () => {
    requestId++;
    info.value = undefined;
    loading.value = false;
    failed.value = false;
  },
);
onMounted(() => {
  if (route.meta.profileInfoFailed) failed.value = true;
  else void load();
});
onUnmounted(() => {
  requestId++;
});
</script>
<template>
  <Page title="个人信息" description="当前登录账号的只读资料">
    <div v-loading="loading" class="relative min-h-40 max-w-3xl">
      <p v-if="loading" role="status">正在获取个人信息…</p>
      <div v-else-if="failed" role="alert">
        <ElAlert
          title="个人信息加载失败，请重试。"
          type="error"
          show-icon
          :closable="false"
        />
        <ElButton class="mt-3" @click="load">重试</ElButton>
      </div>
      <template v-else-if="info">
        <ElDescriptions :column="1" border label-width="100px">
          <ElDescriptionsItem label="账号">
            {{ display(info.username) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="昵称">
            {{ display(info.nickname) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="手机">
            {{ display(info.mobile) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="邮箱">
            {{ display(info.email) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="角色">
            {{ info.roles?.length ? info.roles.join('、') : '未分配角色' }}
          </ElDescriptionsItem>
        </ElDescriptions>
        <ElButton class="mt-6" @click="load">刷新个人信息</ElButton>
      </template>
    </div>
  </Page>
</template>
