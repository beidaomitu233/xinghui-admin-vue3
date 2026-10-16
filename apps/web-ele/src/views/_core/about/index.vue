<script lang="ts" setup>
import { About } from '@vben/common-ui';

import { documentationLinks } from '#/layouts/documentation';

defineOptions({ name: 'About' });

const docs = documentationLinks('/about', import.meta.env.VITE_DOCS_URL);
</script>

<template>
  <div class="flex flex-col gap-4">
    <section aria-label="Xinghui 项目版本" class="rounded-lg bg-card p-5">
      <h1 class="text-lg font-semibold">Xinghui 开发预览（未发布）</h1>
      <p class="mt-2">
        部署版本由前后端 commit 和产物校验值共同确定。请查看
        <a
          :href="docs.versions"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline"
        >
          候选版本与配套组合
        </a>
        和
        <a
          :href="docs.upgrade"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline"
        >
          升级说明
        </a>
        。
      </p>
      <p class="mt-2 text-muted-foreground">
        下方为上游 Vben 的构建与依赖信息，包版本不代表 Xinghui 的发布版本。
      </p>
    </section>
    <About />
  </div>
</template>
