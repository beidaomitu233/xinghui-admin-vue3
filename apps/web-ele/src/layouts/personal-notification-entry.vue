<script lang="ts" setup>
import type { PersonalNotification } from '#/api/system/personal-notification';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Bell } from '@vben/icons';
import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

import {
  listMyNotifications,
  markMyNotificationsRead,
} from '#/api/system/personal-notification';
import { usePersonalNotificationStore } from '#/store/personal-notification';

const previewSize = 5;
const refreshIntervalMs = 60_000;

const accessStore = useAccessStore();
const notificationStore = usePersonalNotificationStore();
const route = useRoute();
const router = useRouter();

const open = ref(false);
const previewItems = ref<PersonalNotification[]>([]);
const previewLoading = ref(false);
const previewFailed = ref(false);
const markingPreviewRead = ref(false);
const unreadCount = computed(() => notificationStore.unreadCount);
const visibleUnreadCount = computed(() => {
  const count = unreadCount.value;
  return count !== null && count > 0 ? count : undefined;
});

let pollTimer: ReturnType<typeof setInterval> | undefined;
let countRefreshInFlight: undefined | { promise: Promise<void>; token: string };

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

async function refreshCount() {
  const token = accessStore.accessToken;
  if (!token) return;
  if (countRefreshInFlight?.token === token) {
    await countRefreshInFlight.promise;
    return;
  }

  const promise = notificationStore.refreshUnreadCount();
  countRefreshInFlight = { promise, token };
  try {
    await promise;
  } finally {
    if (countRefreshInFlight?.promise === promise) {
      countRefreshInFlight = undefined;
    }
  }
}

async function loadPreview() {
  if (!accessStore.accessToken) {
    previewItems.value = [];
    previewFailed.value = false;
    return;
  }

  previewLoading.value = true;
  previewFailed.value = false;
  try {
    const result = await listMyNotifications({
      pageNum: 1,
      pageSize: previewSize,
    });
    previewItems.value = result.items;
  } catch {
    previewItems.value = [];
    previewFailed.value = true;
  } finally {
    previewLoading.value = false;
  }
}

async function openInbox(notificationId?: number) {
  open.value = false;
  await router.push({
    name: 'PersonalNotificationInbox',
    query: notificationId ? { notificationId: String(notificationId) } : {},
  });
}

async function markPreviewRead() {
  const ids = previewItems.value
    .filter((item) => item.readTime === null)
    .map((item) => item.id);
  if (ids.length === 0 || markingPreviewRead.value) return;

  markingPreviewRead.value = true;
  try {
    await markMyNotificationsRead(ids);
    await Promise.all([loadPreview(), refreshCount()]);
  } catch {
    ElMessage.error('标记通知已读失败，请重试');
  } finally {
    markingPreviewRead.value = false;
  }
}

watch(
  () => accessStore.accessToken,
  (token) => {
    stopPolling();
    open.value = false;
    previewItems.value = [];
    previewFailed.value = false;
    notificationStore.clearUnreadCount();
    if (!token) return;

    void refreshCount();
    pollTimer = setInterval(() => void refreshCount(), refreshIntervalMs);
  },
  { immediate: true },
);

watch(
  () => route.name,
  (name) => {
    if (name === 'PersonalNotificationInbox') void refreshCount();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopPolling();
  notificationStore.clearUnreadCount();
});
</script>

<template>
  <el-popover
    v-model:visible="open"
    placement="bottom-end"
    :width="360"
    trigger="click"
    @show="loadPreview"
  >
    <template #reference>
      <div class="flex-center mr-2 h-full">
        <el-badge
          :value="visibleUnreadCount"
          :max="99"
          class="notification-badge"
        >
          <el-button
            aria-label="个人通知"
            circle
            text
            title="个人通知"
            @click.stop="open = !open"
          >
            <Bell class="size-5" />
          </el-button>
        </el-badge>
      </div>
    </template>

    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <strong>个人通知</strong>
        <span class="text-xs text-gray-500">
          {{
            unreadCount === null ? '未读数暂不可用' : `未读 ${unreadCount} 条`
          }}
        </span>
      </div>

      <div v-if="previewLoading" class="py-8 text-center text-gray-500">
        正在加载通知…
      </div>
      <el-alert
        v-else-if="previewFailed"
        title="通知加载失败，请重试"
        type="error"
        :closable="false"
      >
        <template #default>
          <el-button link type="primary" @click="loadPreview">重试</el-button>
        </template>
      </el-alert>
      <div
        v-else-if="previewItems.length === 0"
        class="py-8 text-center text-gray-500"
      >
        暂无通知
      </div>
      <div v-else class="max-h-80 space-y-1 overflow-auto">
        <button
          v-for="item in previewItems"
          :key="item.id"
          class="w-full rounded px-3 py-2 text-left hover:bg-gray-100"
          type="button"
          @click="openInbox(item.id)"
        >
          <span class="flex items-center justify-between gap-3">
            <span class="truncate font-medium">{{ item.title }}</span>
            <el-tag v-if="item.readTime === null" size="small" type="warning">
              未读
            </el-tag>
          </span>
          <span class="mt-1 block truncate text-xs text-gray-500">
            {{ item.body }}
          </span>
          <span class="mt-1 block text-xs text-gray-400">{{
            item.createTime
          }}</span>
        </button>
      </div>

      <div class="flex justify-between border-t pt-2">
        <el-button
          :disabled="
            markingPreviewRead ||
            !previewItems.some((item) => item.readTime === null)
          "
          :loading="markingPreviewRead"
          size="small"
          @click="markPreviewRead"
        >
          当前列表全部已读
        </el-button>
        <el-button size="small" type="primary" @click="openInbox()">
          查看全部
        </el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.notification-badge :deep(.el-badge__content) {
  pointer-events: none;
}
</style>
