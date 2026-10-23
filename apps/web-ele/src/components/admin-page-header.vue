<script setup lang="ts">
defineProps<{ description?: string; title: string }>();
</script>

<template>
  <header class="admin-page-header">
    <div class="admin-page-heading">
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div
      v-if="$slots.actions"
      class="admin-page-actions"
      role="group"
      aria-label="页面操作"
    >
      <slot name="actions"></slot>
    </div>
  </header>
</template>

<style scoped>
:global(.admin-page.admin-page) {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  height: auto;
  padding: 24px;
}

.admin-page-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  min-height: 56px;
  color: hsl(var(--foreground));
}

.admin-page-heading {
  flex: 1 1 220px;
  min-width: 0;
}

.admin-page-heading h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  overflow-wrap: anywhere;
}

.admin-page-heading p {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 20px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.admin-page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  max-width: 100%;
}

.admin-page-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 767px) {
  :global(.admin-page.admin-page) {
    padding: 16px;
  }
}
</style>
