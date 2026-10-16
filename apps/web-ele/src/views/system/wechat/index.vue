<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
onMounted(() => {
  void router.replace({
    path: '/system/business-config',
    query: { section: 'wechat' },
  });
});
</script>
<template><div role="status" class="p-6">正在打开微信业务配置…</div></template>
