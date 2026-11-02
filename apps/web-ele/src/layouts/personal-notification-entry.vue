<script lang="ts" setup>
import type { NotificationItem } from '@vben/layouts';

import type {
  NotificationId,
  PersonalNotification,
} from '#/api/system/personal-notification';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useVbenDrawer } from '@vben/common-ui';
import { Notification } from '@vben/layouts';
import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

import {
  listMyNotifications,
  markMyNotificationsRead,
} from '#/api/system/personal-notification';
import NotificationCenter from '#/layouts/notification-center.vue';
import { usePersonalNotificationStore } from '#/store/personal-notification';

const previewSize = 5;
const refreshIntervalMs = 60_000;

const accessStore = useAccessStore();
const notificationStore = usePersonalNotificationStore();
const route = useRoute();
const centerVisible = ref(false);
const centerNotificationId = ref<number | string>();

const open = ref(false);
const previewItems = ref<PersonalNotification[]>([]);
const previewLoading = ref(false);
const previewFailed = ref(false);
const markingPreviewRead = ref(false);
const unreadCount = computed(() => notificationStore.unreadCount);
const triggerLabel = computed(() =>
  unreadCount.value === null
    ? '个人通知，未读数暂不可用'
    : `个人通知，未读 ${unreadCount.value} 条`,
);
let previewGeneration = 0;
const popupItems = computed<NotificationItem[]>(() =>
  previewLoading.value || previewFailed.value
    ? []
    : previewItems.value.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.body,
        date: item.createTime,
        avatar: '',
        isRead: item.readTime !== null,
      })),
);
watch(open, (visible) => {
  if (visible) void loadPreview();
});
async function markPreviewItem(item: NotificationItem) {
  if (markingPreviewRead.value) return;
  const token = accessStore.accessToken;
  markingPreviewRead.value = true;
  try {
    await markMyNotificationsRead([item.id]);
    if (token === accessStore.accessToken)
      await Promise.all([loadPreview(), refreshCount()]);
  } catch {
    if (token === accessStore.accessToken)
      ElMessage.error('标记通知已读失败，请重试');
  } finally {
    if (token === accessStore.accessToken) markingPreviewRead.value = false;
  }
}

const [CenterDrawer, centerDrawerApi] = useVbenDrawer({
  title: '通知中心',
  class: 'w-[min(960px,100vw)]',
  footer: false,
  onOpenChange: (visible) => {
    centerVisible.value = visible;
  },
  onClosed: () => refreshCount(),
});
watch(centerVisible, (visible) => {
  if (visible) centerDrawerApi.open();
  else centerDrawerApi.close();
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
  const run = ++previewGeneration;
  if (!accessStore.accessToken) {
    previewItems.value = [];
    previewFailed.value = false;
    return;
  }

  const token = accessStore.accessToken;
  previewLoading.value = true;
  previewFailed.value = false;
  try {
    const result = await listMyNotifications({
      pageNum: 1,
      pageSize: previewSize,
    });
    if (run !== previewGeneration || token !== accessStore.accessToken) return;
    previewItems.value = result.items;
  } catch {
    if (run !== previewGeneration || token !== accessStore.accessToken) return;
    previewItems.value = [];
    previewFailed.value = true;
  } finally {
    if (run === previewGeneration && token === accessStore.accessToken)
      previewLoading.value = false;
  }
}

async function openInbox(notificationId?: NotificationId) {
  open.value = false;
  centerNotificationId.value = notificationId;
  centerVisible.value = true;
}

async function markPreviewRead() {
  const token = accessStore.accessToken;
  const ids = previewItems.value
    .filter((item) => item.readTime === null)
    .map((item) => item.id);
  if (ids.length === 0 || markingPreviewRead.value) return;

  markingPreviewRead.value = true;
  try {
    await markMyNotificationsRead(ids);
    if (token !== accessStore.accessToken) return;
    await Promise.all([loadPreview(), refreshCount()]);
  } catch {
    if (token === accessStore.accessToken)
      ElMessage.error('标记通知已读失败，请重试');
  } finally {
    if (token === accessStore.accessToken) markingPreviewRead.value = false;
  }
}

watch(
  () => accessStore.accessToken,
  (token) => {
    previewGeneration++;
    previewLoading.value = false;
    markingPreviewRead.value = false;
    stopPolling();
    open.value = false;
    centerVisible.value = false;
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
  () => [route.name, route.query.notificationId, route.query.open],
  () => {
    if (route.name === 'PersonalNotificationInbox') {
      centerNotificationId.value =
        typeof route.query.notificationId === 'string'
          ? route.query.notificationId
          : undefined;
      centerVisible.value = true;
      void refreshCount();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  previewGeneration++;
  stopPolling();
  notificationStore.clearUnreadCount();
});
</script>

<template>
  <Notification
    v-model:open="open"
    :trigger-label="triggerLabel"
    :dot="unreadCount !== null && unreadCount > 0"
    :notifications="popupItems"
    :show-clear="false"
    :show-remove="false"
    :navigate-on-click="false"
    :mark-all-disabled="
      previewLoading ||
      markingPreviewRead ||
      !previewItems.some((item) => item.readTime === null)
    "
    mark-all-text="当前列表已读"
    @item-click="(item) => openInbox(item.id)"
    @read="markPreviewItem"
    @make-all="markPreviewRead"
    @view-all="openInbox()"
  >
    <template #empty>
      <div class="p-4">
        <el-skeleton v-if="previewLoading" :rows="3" animated />
        <el-alert
          v-else-if="previewFailed"
          title="通知加载失败，请重试"
          type="error"
          :closable="false"
        >
          <el-button link type="primary" @click="loadPreview">重试</el-button>
        </el-alert>
        <el-empty v-else description="暂无通知" :image-size="64" />
      </div>
    </template>
  </Notification>
  <CenterDrawer>
    <NotificationCenter
      v-if="centerVisible"
      :notification-id="centerNotificationId"
      @navigate="centerVisible = false"
    />
  </CenterDrawer>
</template>
