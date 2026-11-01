<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { Loading } from '@vben/common-ui';

const router = useRouter();
onMounted(() => {
  void router.replace({
    path: '/system/business-config',
    query: { section: 'wechat' },
  });
});
</script>
<template>
  <Loading :spinning="true" text="正在打开微信业务配置…" class="m-6" />
</template>
