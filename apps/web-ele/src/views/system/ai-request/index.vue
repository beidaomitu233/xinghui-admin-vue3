<script setup lang="ts">
import { Page } from '@vben/common-ui';

import MonitorWorkspace from './MonitorWorkspace.vue';
</script>
<template>
  <Page
    auto-content-height
    header-class="flex-wrap gap-3"
    title="AI统计"
    description="分析模型成本、速度、使用情况与输出反馈"
  >
    <MonitorWorkspace />
  </Page>
</template>
