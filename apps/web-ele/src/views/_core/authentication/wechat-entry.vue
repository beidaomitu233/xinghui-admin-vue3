<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
onMounted(async () => {
  try {
    capability.value = await getWechatLoginCapability();
  } catch {
    error.value = '微信登录配置暂时不可用，请使用手机号登录。';
  }
});
async function start() {
  if (!available.value || starting.value) return;
  starting.value = true;
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
    window.location.assign(result.authorizationUrl);
  } catch {
    error.value = '暂时无法发起微信登录，请稍后重试或使用手机号登录。';
    starting.value = false;
  }
}
async function cancel() {
  try {
    await cancelWechatFlow(pending.value);
    sessionStorage.removeItem(WECHAT_FLOW_KEY);
    pending.value = '';
    error.value = '';
  } catch {
    error.value = '取消失败，请重试；流程到期后会自动失效。';
  }
}
</script>
<template>
  <div class="mt-4 border-t pt-4">
    <p v-if="externalMobile" class="text-sm text-muted-foreground">
      手机外部浏览器请使用手机号登录，或在微信内打开本页授权；电脑可使用微信扫码登录。
    </p>
    <button
      v-else-if="available"
      type="button"
      class="w-full rounded border p-2"
      :disabled="starting"
      @click="start"
    >
      {{
        starting
          ? '正在发起授权…'
          : channel === 'mp'
            ? '微信内授权登录'
            : '微信扫码登录'
      }}
    </button>
    <p v-else class="text-sm text-muted-foreground">
      当前微信登录暂不可用，请使用手机号登录。
    </p>
    <div v-if="pending" class="mt-2 text-sm" role="status">
      请在微信确认登录。
      <RouterLink class="ml-2 underline" to="/auth/wechat-result">
        查看授权结果
      </RouterLink>
      <button class="ml-2 underline" type="button" @click="cancel">
        取消本次授权
      </button>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-sm">{{ error }}</p>
  </div>
</template>
