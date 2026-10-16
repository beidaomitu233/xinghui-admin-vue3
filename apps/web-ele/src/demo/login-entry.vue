<script setup lang="ts">
import { useAuthStore } from '#/store';

import { DEMO_LOGIN } from './seed';

const auth = useAuthStore();
async function enter() {
  try {
    await auth.authLogin(DEMO_LOGIN);
  } catch {
    /* Request UI reports local storage/session failures. */
  }
}
</script>
<template>
  <div class="mt-3">
    <h1 class="mb-3 text-xl font-semibold">星辉后台静态演示</h1>
    <p class="mb-4 text-muted-foreground">
      使用纯虚构数据体验页面，无需填写手机号或密码。
    </p>
    <button
      type="button"
      class="w-full rounded border p-2"
      :disabled="auth.loginLoading"
      @click="enter"
    >
      使用虚构账号进入演示
    </button>
    <p class="mt-2 text-sm text-muted-foreground">
      无需真实账号。微信、短信、AI及对象存储外发已禁用。
    </p>
  </div>
</template>
