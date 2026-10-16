<script lang="ts" setup>
import type { PersonalNotification } from '#/api/system/personal-notification';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';

import {
  getMyNotification,
  listMyNotifications,
  markMyNotificationRead,
  markMyNotificationsRead,
} from '#/api/system/personal-notification';
import { usePersonalNotificationStore } from '#/store/personal-notification';

import {
  resolveNotificationTarget,
  validateNotificationTarget,
} from './target-navigation';

const pageSize = 10;
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const notificationStore = usePersonalNotificationStore();

const rows = ref<PersonalNotification[]>([]);
const total = ref(0);
const pageNum = ref(1);
const unreadOnly = ref(false);
const loading = ref(false);
const failed = ref(false);
const selectedIds = ref<number[]>([]);
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailFailed = ref(false);
const detailId = ref<number>();
const detail = ref<PersonalNotification>();
const markingId = ref<number>();
const markingBatch = ref(false);

const targetResolution = computed(() =>
  resolveNotificationTarget(
    detail.value?.target ?? null,
    router,
    userStore.userRoles,
  ),
);

async function loadList() {
  loading.value = true;
  failed.value = false;
  selectedIds.value = [];
  try {
    const result = await listMyNotifications({
      pageNum: pageNum.value,
      pageSize,
      unreadOnly: unreadOnly.value ? true : undefined,
    });
    rows.value = result.items;
    total.value = result.total;
  } catch {
    rows.value = [];
    total.value = 0;
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

async function refreshAll() {
  await Promise.all([loadList(), notificationStore.refreshUnreadCount()]);
}

function changeFilter(value: unknown) {
  unreadOnly.value = value === true;
  pageNum.value = 1;
  void loadList();
}

function changePage(value: number) {
  pageNum.value = value;
  void loadList();
}

function canSelect(row: PersonalNotification) {
  return row.readTime === null;
}

function updateSelection(selection: PersonalNotification[]) {
  selectedIds.value = selection
    .filter((item) => item.readTime === null)
    .map((item) => item.id);
}

async function openDetail(id: number) {
  detailId.value = id;
  detail.value = undefined;
  detailFailed.value = false;
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getMyNotification(id);
  } catch {
    detailFailed.value = true;
  } finally {
    detailLoading.value = false;
  }
}

function retryDetail() {
  if (detailId.value !== undefined) void openDetail(detailId.value);
}

function parseNotificationId(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

watch(
  () => route.query.notificationId,
  (value) => {
    if (value === undefined) return;
    const id = parseNotificationId(value);
    if (id === undefined) {
      detailVisible.value = true;
      detailId.value = undefined;
      detail.value = undefined;
      detailFailed.value = true;
      return;
    }
    void openDetail(id);
  },
  { immediate: true },
);

async function closeDetail() {
  detail.value = undefined;
  detailId.value = undefined;
  if (route.query.notificationId !== undefined) {
    await router.replace({ name: 'PersonalNotificationInbox' });
  }
}

async function markOneRead(item: PersonalNotification) {
  if (item.readTime !== null || markingId.value !== undefined) return;
  markingId.value = item.id;
  try {
    await markMyNotificationRead(item.id);
    ElMessage.success('已标记为已读');
    const refreshDetail =
      detailId.value === item.id
        ? getMyNotification(item.id).then((value) => {
            detail.value = value;
          })
        : Promise.resolve();
    await Promise.all([
      loadList(),
      notificationStore.refreshUnreadCount(),
      refreshDetail,
    ]);
  } catch {
    ElMessage.error('标记通知已读失败，请重试');
  } finally {
    markingId.value = undefined;
  }
}

async function markSelectedRead() {
  const ids = [...selectedIds.value];
  if (ids.length === 0 || markingBatch.value) return;

  markingBatch.value = true;
  try {
    await markMyNotificationsRead(ids);
    ElMessage.success(`已标记 ${ids.length} 条通知为已读`);
    await Promise.all([loadList(), notificationStore.refreshUnreadCount()]);
  } catch {
    ElMessage.error('批量标记通知已读失败，请重试');
  } finally {
    markingBatch.value = false;
  }
}

async function openBusinessTarget() {
  const resolution = targetResolution.value;
  switch (resolution.kind) {
    case 'empty': {
      ElMessage.info('此通知没有关联业务页面');
      return;
    }
    case 'external': {
      ElMessage.info('此通知包含外部目标，系统不会自动打开外部链接');
      return;
    }
    case 'forbidden': {
      ElMessage.warning('当前账号无权访问该业务页面');
      return;
    }
    case 'internal': {
      break;
    }
    case 'invalid': {
      ElMessage.warning('关联目标无效，暂时无法打开');
      return;
    }
    case 'missing': {
      ElMessage.info('目标页面不存在或不可用，已留在通知列表');
      return;
    }
    case 'unavailable': {
      ElMessage.info('该通知的关联页面暂时无法打开，请联系管理员。');
      return;
    }
  }

  const availability = await validateNotificationTarget(
    resolution,
    router,
    userStore.userRoles,
  );
  if (availability === 'missing') {
    ElMessage.info('目标记录不存在或已失效，已留在通知列表');
    return;
  }
  if (availability === 'forbidden') {
    ElMessage.warning('当前账号无权访问目标记录，已留在通知列表');
    return;
  }
  if (availability === 'unavailable') {
    ElMessage.info('目标记录暂时无法校验，已留在通知列表');
    return;
  }

  try {
    await router.push(resolution.fullPath);
    if (router.currentRoute.value.name !== resolution.name) {
      await router.replace({ name: 'PersonalNotificationInbox' });
      ElMessage.warning('当前账号无权访问该业务页面');
    }
  } catch {
    await router.replace({ name: 'PersonalNotificationInbox' });
    ElMessage.info('目标页面暂时无法打开，请返回通知列表');
  }
}

function formatTime(value: string) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
}

onMounted(() => {
  void loadList();
});
</script>

<template>
  <Page title="个人通知" description="只展示当前账号收到的站内通知">
    <div class="space-y-4 p-4">
      <el-card>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong>收件箱</strong>
              <span class="ml-2 text-sm text-gray-500">共 {{ total }} 条</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <el-radio-group
                :model-value="unreadOnly"
                size="small"
                @update:model-value="changeFilter"
              >
                <el-radio-button :value="false">全部</el-radio-button>
                <el-radio-button :value="true">仅未读</el-radio-button>
              </el-radio-group>
              <el-button :loading="loading" @click="refreshAll">刷新</el-button>
              <el-button
                :disabled="selectedIds.length === 0"
                :loading="markingBatch"
                type="primary"
                @click="markSelectedRead"
              >
                批量标记已读（{{ selectedIds.length }}）
              </el-button>
            </div>
          </div>
        </template>

        <el-alert
          v-if="failed"
          class="mb-4"
          title="通知加载失败，请重试"
          type="error"
          closable
        >
          <template #default>
            <el-button link type="primary" @click="loadList">
              重新加载
            </el-button>
          </template>
        </el-alert>

        <el-table
          v-loading="loading"
          :data="rows"
          empty-text="暂无通知"
          row-key="id"
          stripe
          @selection-change="updateSelection"
        >
          <el-table-column
            type="selection"
            width="50"
            :selectable="canSelect"
          />
          <el-table-column
            prop="title"
            label="通知标题"
            min-width="220"
            show-overflow-tooltip
          />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.readTime === null ? 'warning' : 'info'">
                {{ row.readTime === null ? '未读' : '已读' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="收到时间" min-width="180">
            <template #default="{ row }">
              {{ formatTime(row.createTime) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row.id)">
                查看详情
              </el-button>
              <el-button
                v-if="row.readTime === null"
                link
                type="primary"
                :loading="markingId === row.id"
                @click="markOneRead(row)"
              >
                标为已读
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="total > pageSize" class="mt-4 flex justify-end">
          <el-pagination
            :current-page="pageNum"
            :page-size="pageSize"
            :total="total"
            layout="total, prev, pager, next"
            @current-change="changePage"
          />
        </div>
      </el-card>

      <el-dialog
        v-model="detailVisible"
        title="通知详情"
        width="min(680px, 92vw)"
        @closed="closeDetail"
      >
        <div v-if="detailLoading" class="py-8 text-center text-gray-500">
          正在加载通知…
        </div>
        <el-alert
          v-else-if="detailFailed"
          title="通知已失效或无访问权限"
          type="error"
          closable
        >
          <template #default>
            <el-button link type="primary" @click="retryDetail">重试</el-button>
          </template>
        </el-alert>
        <template v-else-if="detail">
          <h2 class="mb-2 text-lg font-semibold">{{ detail.title }}</h2>
          <p class="mb-4 text-sm text-gray-500">
            收到时间：{{ formatTime(detail.createTime) }}
          </p>
          <div class="whitespace-pre-wrap break-words leading-7">
            {{ detail.body }}
          </div>
          <div class="mt-5 rounded bg-gray-50 p-3 text-sm text-gray-600">
            <template v-if="detail.target">
              <span v-if="targetResolution.kind === 'internal'">
                {{
                  targetResolution.policy === 'list'
                    ? '此通知关联了已登记的站内列表页。'
                    : '打开前将校验目标记录是否存在及当前账号权限。'
                }}
              </span>
              <span v-else-if="targetResolution.kind === 'external'">
                此通知包含外部目标，系统不会自动打开外部链接。
              </span>
              <span v-else-if="targetResolution.kind === 'unavailable'">
                该通知的关联页面暂时无法打开，请联系管理员。
              </span>
              <span v-else>此通知关联的目标目前不可用。</span>
            </template>
            <span v-else>此通知没有关联业务页面。</span>
          </div>
        </template>
        <template #footer>
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button
            v-if="detail && detail.readTime === null"
            :loading="markingId === detail.id"
            @click="markOneRead(detail)"
          >
            标记已读
          </el-button>
          <el-button
            v-if="detail?.target"
            type="primary"
            @click="openBusinessTarget"
          >
            打开关联页面
          </el-button>
        </template>
      </el-dialog>
    </div>
  </Page>
</template>
