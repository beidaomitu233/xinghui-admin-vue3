<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const message = computed(() => {
  if (route.query.status === 'pending')
    return '授权流程已验证。本阶段尚未验证微信身份或建立登录态，请使用手机号登录。';
  if (route.query.status === 'cancelled')
    return '本次授权已取消，请使用手机号登录。';
  return '授权流程无效或已过期，请返回登录页重试。';
});
</script>
<template>
  <section class="p-6">
    <h1 class="mb-4 text-xl">微信网站授权</h1>
    <p role="status">{{ message }}</p>
    <RouterLink class="mt-6 inline-block underline" to="/auth/login">
      返回手机号登录
    </RouterLink>
  </section>
</template>
