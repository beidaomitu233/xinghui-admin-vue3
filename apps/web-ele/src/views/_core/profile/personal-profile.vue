<script setup lang="ts">
import type { SessionUserInfo } from '#/api/core/session-info';

import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore, useUserStore } from '@vben/stores';

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
  <Page title="个人信息">
    <section class="max-w-3xl rounded bg-background p-6">
      <p class="mb-4 text-sm text-muted-foreground">当前登录账号的只读资料</p>
      <p v-if="loading" role="status">正在获取个人信息…</p>
      <div v-else-if="failed" role="alert">
        <p>个人信息加载失败，请重试。</p>
        <button class="mt-3 underline" type="button" @click="load">重试</button>
      </div>
      <template v-else-if="info">
        <dl class="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-5 break-words">
          <dt>账号</dt>
          <dd>{{ display(info.username) }}</dd>
          <dt>昵称</dt>
          <dd>{{ display(info.nickname) }}</dd>
          <dt>手机</dt>
          <dd>{{ display(info.mobile) }}</dd>
          <dt>邮箱</dt>
          <dd>{{ display(info.email) }}</dd>
          <dt>角色</dt>
          <dd>
            {{ info.roles?.length ? info.roles.join('、') : '未分配角色' }}
          </dd>
        </dl>
        <button class="mt-6 underline" type="button" @click="load">
          刷新个人信息
        </button>
      </template>
    </section>
  </Page>
</template>
