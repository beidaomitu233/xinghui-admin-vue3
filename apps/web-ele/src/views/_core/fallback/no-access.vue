<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import { useAuthStore } from '#/store';

const authStore = useAuthStore();

async function logout() {
  await authStore.logout(false);
}
</script>

<template>
  <Page title="暂无可访问页面">
    <div
      class="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center"
    >
      <p class="text-base">
        当前账号尚未获得可访问的页面，请联系管理员分配角色和菜单权限。
      </p>
      <el-button type="primary" @click="logout">退出登录</el-button>
    </div>
  </Page>
</template>
