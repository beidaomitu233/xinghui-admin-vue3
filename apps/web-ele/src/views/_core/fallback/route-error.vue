<script setup lang="ts">
defineProps<{ missing?: boolean; retry: () => void }>();
</script>

<template>
  <section class="m-6 rounded-lg bg-background p-8" role="alert">
    <h1 class="mb-3 text-xl font-semibold">
      {{ missing ? '此菜单的页面尚未接入' : '页面加载失败' }}
    </h1>
    <p class="mb-5 text-muted-foreground">
      {{
        missing
          ? '菜单已授权，但当前版本没有对应页面。请联系管理员确认功能交付；更新后可重试。'
          : '页面资源未能加载，请检查网络后重试。'
      }}
    </p>
    <button
      class="rounded bg-primary px-4 py-2 text-primary-foreground"
      type="button"
      @click="retry"
    >
      重试加载页面
    </button>
  </section>
</template>
