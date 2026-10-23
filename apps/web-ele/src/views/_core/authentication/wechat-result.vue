<script setup lang="ts">
import type { WechatFlowStatus } from '#/api/system/wechat';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import {
  bindWechatFlow,
  cancelWechatFlow,
  completeWechatFlow,
  getWechatFlow,
  safeWechatReturn,
  WECHAT_FLOW_KEY,
} from '#/api/system/wechat';
import { useAuthStore } from '#/store';

const router = useRouter();
const access = useAccessStore();
const auth = useAuthStore();
const users = useUserStore();
const flow = sessionStorage.getItem(WECHAT_FLOW_KEY) ?? '';
const state = ref<WechatFlowStatus>();
const busy = ref(false);
const error = ref('');
const message = computed(
  () =>
    ({
      WAITING: '请在微信确认登录。',
      READY_BIND: '微信身份已确认。请登录已有产品账号，再确认关联。',
      READY_LOGIN: '微信身份已确认，关联产品账号将检查可用状态后登录。',
      CANCELLED: '本次微信授权已取消，可以重新发起。',
      COMPLETED: '本次流程已完成，请返回业务页面。',
      EXPIRED: '微信登录已过期或配置已变更，请重新发起。',
      FAILED: '微信身份验证失败，请重新发起或使用手机号登录。',
    })[state.value?.status ?? 'EXPIRED'],
);
async function refresh() {
  busy.value = true;
  error.value = '';
  try {
    state.value = await getWechatFlow(flow);
  } catch {
    error.value = '无法读取本次授权，请在发起授权的同一浏览器重试。';
  } finally {
    busy.value = false;
  }
  if (state.value?.status === 'READY_LOGIN' && !error.value) await finish();
}
async function finish() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    let target = '/';
    if (state.value?.status === 'READY_LOGIN') {
      const result = await completeWechatFlow(flow);
      resetAllStores();
      access.setAccessToken(result.accessToken);
      try {
        await auth.fetchUserInfo();
      } catch (error_) {
        resetAllStores();
        throw error_;
      }
      target = safeWechatReturn(result.returnPath);
    } else if (state.value?.status === 'READY_BIND' && access.accessToken) {
      const result = await bindWechatFlow(flow);
      target = safeWechatReturn(result.returnPath);
    } else {
      return;
    }
    sessionStorage.removeItem(WECHAT_FLOW_KEY);
    await router.replace(target);
  } catch {
    error.value =
      '登录或关联失败，流程信息已保留。请检查账号状态，刷新结果后重试。';
  } finally {
    busy.value = false;
  }
}
async function cancel() {
  busy.value = true;
  try {
    await cancelWechatFlow(flow);
    sessionStorage.removeItem(WECHAT_FLOW_KEY);
    await router.replace('/auth/login');
  } catch {
    error.value = '取消失败，请重试。';
  } finally {
    busy.value = false;
  }
}
onMounted(refresh);
</script>
<template>
  <section class="p-6">
    <h1 class="mb-4 text-xl">微信登录</h1>
    <p role="status">{{ message }}</p>
    <p v-if="error" role="alert" class="mt-3">{{ error }}</p>
    <div class="mt-5 flex flex-wrap gap-3">
      <button
        v-if="state?.status === 'READY_LOGIN' && error"
        type="button"
        class="rounded border p-2"
        :disabled="busy"
        @click="finish"
      >
        重试登录
      </button>
      <template v-if="state?.status === 'READY_BIND'">
        <button
          v-if="access.accessToken"
          type="button"
          class="rounded border p-2"
          :disabled="busy"
          @click="finish"
        >
          确认关联当前账号 {{ users.userInfo?.realName }}
        </button>
        <RouterLink v-else class="underline" to="/auth/login">
          先登录已有产品账号
        </RouterLink>
      </template>
      <button type="button" class="underline" :disabled="busy" @click="refresh">
        刷新授权结果
      </button>
      <button
        v-if="flow"
        type="button"
        class="underline"
        :disabled="busy"
        @click="cancel"
      >
        取消并返回登录
      </button>
      <RouterLink class="underline" to="/auth/login">
        重新发起 / 手机号登录
      </RouterLink>
    </div>
  </section>
</template>
