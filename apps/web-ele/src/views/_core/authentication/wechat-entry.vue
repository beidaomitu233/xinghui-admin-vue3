<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import {
  cancelWechatFlow,
  getWechatLoginCapability,
  isWechatLoginUrl,
  safeWechatReturn,
  startWechatLogin,
  WECHAT_FLOW_KEY,
} from '#/api/system/wechat';

const route = useRoute();
const ua = navigator.userAgent.toLowerCase();
const channel = ua.includes('micromessenger') ? 'mp' : 'website';
const externalMobile =
  channel === 'website' && /mobile|android|iphone/u.test(ua);
const capability = ref({ mp: false, website: false });
const available = computed(() => !externalMobile && capability.value[channel]);
const starting = ref(false);
const error = ref('');
const pending = ref(sessionStorage.getItem(WECHAT_FLOW_KEY) ?? '');
const authorizationUrl = ref('');
const checking = ref(true);
const expired = ref(false);
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
onMounted(async () => {
  try {
    capability.value = await getWechatLoginCapability();
  } catch {
    error.value = '微信登录配置暂时不可用，请使用手机号登录。';
  } finally {
    checking.value = false;
  }
  if (available.value && channel === 'website') await start();
});
onUnmounted(() => clearTimeout(expiryTimer));
async function start() {
  if (!available.value || starting.value) return;
  starting.value = true;
  expired.value = false;
  authorizationUrl.value = '';
  clearTimeout(expiryTimer);
  error.value = '';
  try {
    let target: unknown = route.query.redirect;
    if (typeof target === 'string') {
      try {
        target = decodeURIComponent(target);
      } catch {
        target = '/';
      }
    }
    const result = await startWechatLogin(channel, safeWechatReturn(target));
    if (!isWechatLoginUrl(result.authorizationUrl, channel))
      throw new Error('Invalid authorization URL');
    sessionStorage.setItem(WECHAT_FLOW_KEY, result.flow);
    pending.value = result.flow;
    if (channel === 'mp') {
      window.location.assign(result.authorizationUrl);
    } else {
      const url = new URL(result.authorizationUrl);
      url.searchParams.set('self_redirect', 'false');
      authorizationUrl.value = url.href;
      expiryTimer = setTimeout(() => {
        expired.value = true;
        authorizationUrl.value = '';
      }, result.expiresInSeconds * 1000);
    }
  } catch {
    error.value = '暂时无法发起微信登录，请稍后重试或使用手机号登录。';
  } finally {
    starting.value = false;
  }
}
async function cancel() {
  try {
    await cancelWechatFlow(pending.value);
    sessionStorage.removeItem(WECHAT_FLOW_KEY);
    pending.value = '';
    authorizationUrl.value = '';
    clearTimeout(expiryTimer);
    error.value = '';
  } catch {
    error.value = '取消失败，请重试；流程到期后会自动失效。';
  }
}
</script>
<template>
  <aside aria-label="微信登录" class="text-center">
    <h2 class="mb-5 text-lg font-semibold">微信扫码登录</h2>
    <div
      class="mx-auto flex min-h-[280px] w-[280px] max-w-full items-center justify-center rounded-xl border bg-background"
    >
      <iframe
        v-if="authorizationUrl"
        :src="authorizationUrl"
        title="微信登录二维码"
        class="h-[380px] w-[280px] border-0"
        referrerpolicy="no-referrer"
      ></iframe>
      <el-skeleton
        v-else-if="checking || starting"
        :rows="4"
        animated
        class="p-8"
      />
      <el-empty
        v-else
        :image-size="72"
        :description="
          expired
            ? '二维码已过期'
            : available
              ? '点击下方重新获取二维码'
              : '微信登录暂未配置'
        "
      />
    </div>
    <p v-if="externalMobile" class="text-sm text-muted-foreground">
      手机外部浏览器请使用手机号登录，或在微信内打开本页授权；电脑可使用微信扫码登录。
    </p>
    <button
      v-else-if="available"
      type="button"
      class="mt-4 rounded border px-4 py-2 text-sm"
      :disabled="starting"
      @click="start"
    >
      {{
        starting
          ? '正在发起授权…'
          : channel === 'mp'
            ? '微信内授权登录'
            : '刷新微信二维码'
      }}
    </button>
    <p v-else class="mt-4 text-xs text-muted-foreground">
      可使用账号密码或短信登录。
    </p>
    <div v-if="pending" class="mt-2 text-sm" role="status">
      请使用微信扫一扫。
      <RouterLink class="ml-2 underline" to="/auth/wechat-result">
        查看授权结果
      </RouterLink>
      <button class="ml-2 underline" type="button" @click="cancel">
        取消本次授权
      </button>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-sm">{{ error }}</p>
  </aside>
</template>
