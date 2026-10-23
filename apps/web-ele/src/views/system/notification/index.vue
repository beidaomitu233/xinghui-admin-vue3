<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';

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
  <div class="p-6"><el-button @click="reopen">打开通知中心</el-button></div>
</template>
