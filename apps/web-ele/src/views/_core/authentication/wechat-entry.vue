<script setup lang="ts">
import { onMounted, ref } from 'vue';

import {
  getWechatCapability,
  isWechatAuthorizationUrl,
  startWechatAuthorization,
} from '#/api/system/wechat';

const available = ref(false);
const starting = ref(false);
const error = ref('');
onMounted(async () => {
  try {
    const capability = await getWechatCapability();
    available.value = capability.available;
  } catch {
    available.value = false;
  }
});
async function start() {
  if (!available.value || starting.value) return;
  starting.value = true;
  error.value = '';
  try {
    const result = await startWechatAuthorization();
    if (!isWechatAuthorizationUrl(result.authorizationUrl))
      throw new Error('Invalid authorization URL');
    window.location.assign(result.authorizationUrl);
  } catch {
    error.value = '暂时无法发起微信授权，请稍后重试或使用手机号登录。';
    starting.value = false;
  }
}
</script>
<template>
  <div v-if="available" class="mt-4 border-t pt-4">
    <button
      type="button"
      class="w-full rounded border p-2"
      :disabled="starting"
      @click="start"
    >
      {{ starting ? '正在发起授权…' : '微信网站授权' }}
    </button>
    <p class="mt-2 text-sm text-gray-500">
      当前仅接入授权流程，尚不支持微信账号登录。
    </p>
    <p v-if="error" role="alert" class="mt-2 text-sm">{{ error }}</p>
  </div>
</template>
