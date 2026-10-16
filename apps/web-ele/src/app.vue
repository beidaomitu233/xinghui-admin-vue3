<script lang="ts" setup>
import { defineAsyncComponent } from 'vue';

import { useElementPlusDesignTokens } from '@vben/hooks';

import { ElConfigProvider } from 'element-plus';

import { elementLocale } from '#/locales';

defineOptions({ name: 'App' });

useElementPlusDesignTokens();
const DemoNotice =
  import.meta.env.VITE_APP_DEMO === 'true'
    ? defineAsyncComponent(() => import('./demo/notice.vue'))
    : undefined;
</script>

<template>
  <ElConfigProvider :locale="elementLocale">
    <component :is="DemoNotice" v-if="DemoNotice" />
    <RouterView />
  </ElConfigProvider>
</template>
