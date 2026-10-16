<script setup lang="ts">
defineProps<{ details?: string; title: string }>();
</script>

<template>
  <el-alert :title="title" type="info" show-icon closable class="mb-4">
    <details v-if="details" class="mt-1">
      <summary class="cursor-pointer">查看说明</summary>
      <p class="mt-2">{{ details }}</p>
    </details>
  </el-alert>
</template>
