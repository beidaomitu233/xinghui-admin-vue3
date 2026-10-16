<script setup lang="ts">
import { Page } from '@vben/common-ui';

import RequestLogPanel from './RequestLogPanel.vue';
</script>
<template>
  <Page title="AI 日志记录">
    <el-card class="m-4"><RequestLogPanel /></el-card>
  </Page>
</template>
