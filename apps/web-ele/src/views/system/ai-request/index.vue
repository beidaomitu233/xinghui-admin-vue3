<script setup lang="ts">
import { Page } from '@vben/common-ui';

import MonitorWorkspace from './MonitorWorkspace.vue';
</script>
<template>
  <Page
    auto-content-height
    header-class="flex-wrap gap-3"
    title="调用监控"
    description="查看对话记录与模型调用情况"
  >
    <MonitorWorkspace />
  </Page>
</template>
