<script setup lang="ts">
import { computed } from 'vue';

import { useData, withBase } from 'vitepress';

import { sections } from '../chapters.mjs';

const { page } = useData();
const section = computed(() =>
  sections.find((item) =>
    item.items.some(([path]) => `${path}.md` === page.value.relativePath),
  ),
);
</script>

<template>
  <nav class="docs-breadcrumb" aria-label="文档面包屑">
    <a :href="withBase('/')">文档首页</a>
    <template v-if="section">
      <span aria-hidden="true"> / </span>
      <a :href="withBase(`/${section.items[0][0]}.html`)">{{
        section.title
      }}</a>
    </template>
    <span aria-hidden="true"> / </span>
    <span aria-current="page">{{ page.title }}</span>
  </nav>
</template>
