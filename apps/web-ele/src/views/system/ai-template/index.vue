<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
onMounted(() => {
  void router.replace('/ai/configurations');
});
</script>
<template><span></span></template>
