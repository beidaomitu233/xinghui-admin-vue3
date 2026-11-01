<script setup lang="ts">
import { computed } from 'vue';

import { renderAgentMarkdown } from './markdown';

const props = defineProps<{ text: string }>();
const html = computed(() => renderAgentMarkdown(props.text));
</script>

<template>
  <!-- Only DOMPurify's inert text/table allowlist reaches this HTML boundary. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="agent-markdown" v-html="html"></div>
</template>

<style scoped>
.agent-markdown {
  overflow-x: auto;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.agent-markdown :deep(:first-child) {
  margin-top: 0;
}

.agent-markdown :deep(:last-child) {
  margin-bottom: 0;
}

.agent-markdown :deep(p),
.agent-markdown :deep(ul),
.agent-markdown :deep(ol),
.agent-markdown :deep(blockquote),
.agent-markdown :deep(pre),
.agent-markdown :deep(table) {
  margin: 12px 0;
}

.agent-markdown :deep(h1),
.agent-markdown :deep(h2),
.agent-markdown :deep(h3),
.agent-markdown :deep(h4),
.agent-markdown :deep(h5),
.agent-markdown :deep(h6) {
  margin: 20px 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.agent-markdown :deep(ul) {
  padding-left: 24px;
  list-style: disc;
}

.agent-markdown :deep(ol) {
  padding-left: 24px;
  list-style: decimal;
}

.agent-markdown :deep(code),
.agent-markdown :deep(pre) {
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.agent-markdown :deep(code) {
  padding: 2px 4px;
}

.agent-markdown :deep(pre) {
  padding: 12px 16px;
  overflow-x: auto;
}

.agent-markdown :deep(pre code) {
  padding: 0;
}

.agent-markdown :deep(blockquote) {
  padding-left: 16px;
  color: var(--el-text-color-secondary);
  border-left: 3px solid var(--el-border-color);
}

.agent-markdown :deep(table) {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.agent-markdown :deep(th),
.agent-markdown :deep(td) {
  padding: 10px 12px;
  text-align: left;
  border: 1px solid var(--el-border-color-lighter);
}

.agent-markdown :deep(th) {
  font-weight: 500;
  background: var(--el-fill-color-light);
}

.agent-markdown :deep(a) {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.agent-markdown :deep(hr) {
  border-color: var(--el-border-color-lighter);
}
</style>
