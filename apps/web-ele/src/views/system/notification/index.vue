<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

const route = useRoute();
const router = useRouter();
function reopen() {
  void router.replace({
    name: 'PersonalNotificationInbox',
    query: { ...route.query, open: String(Date.now()) },
  });
}
</script>
<template>
  <Page title="通知中心">
    <el-button @click="reopen">打开通知中心</el-button>
  </Page>
</template>
