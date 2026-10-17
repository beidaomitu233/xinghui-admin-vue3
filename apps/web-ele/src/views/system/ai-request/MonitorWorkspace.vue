<script setup lang="ts">
import ConversationWorkspace from './conversations/ConversationWorkspace.vue';

defineProps<{ initialKeySettings?: boolean }>();
</script>
<template>
  <ConversationWorkspace :initial-key-settings="initialKeySettings" />
</template>
