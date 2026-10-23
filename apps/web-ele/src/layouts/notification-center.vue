<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type {
  NotificationId,
  PersonalNotification,
} from '#/api/system/personal-notification';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useVbenModal } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
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
} from '#/views/system/notification/target-navigation';

const props = defineProps<{ notificationId?: number | string }>();
const emit = defineEmits<{ navigate: [] }>();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const notificationStore = usePersonalNotificationStore();

const failed = ref(false);
const selectedIds = ref<NotificationId[]>([]);
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailFailed = ref(false);
const detailId = ref<NotificationId>();
const detail = ref<PersonalNotification>();
const markingId = ref<NotificationId>();
const markingBatch = ref(false);

const targetResolution = computed(() =>
  resolveNotificationTarget(
    detail.value?.target ?? null,
    router,
    userStore.userRoles,
  ),
);

let listVersion = 0;
let detailVersion = 0;
onBeforeUnmount(() => {
  listVersion += 1;
  latestListQuery = Promise.resolve({ items: [], total: 0 });
  detailVersion += 1;
});

let refreshVersion = 0;
type GridResult = { items: PersonalNotification[]; total: number };
let latestListQuery: Promise<GridResult> = Promise.resolve({
  items: [],
  total: 0,
});
function listParameters(
  pageNum: number,
  pageSize: number,
  sort: undefined | { field: string; order?: null | string },
  values: Record<string, unknown> = {},
) {
  return {
    pageNum,
    pageSize,
    unreadOnly: values?.unreadOnly === true ? true : undefined,
    orderBy: sort?.order ? sort.field : 'createTime',
    order: sort?.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}
const gridOptions: VxeTableGridOptions<PersonalNotification> = {
  height: 440,
  rowConfig: { keyField: 'id' },
  columns: [
    { type: 'checkbox', width: 50 },
    { field: 'title', title: '通知标题', minWidth: 220, sortable: true },
    {
      field: 'readTime',
      title: '状态',
      width: 100,
      sortable: true,
      slots: { default: 'readState' },
    },
    {
      field: 'createTime',
      title: '收到时间',
      minWidth: 180,
      sortable: true,
      formatter: ({ row }) => formatTime(row.createTime),
    },
    {
      field: 'actions',
      title: '操作',
      width: 180,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ],
  checkboxConfig: { checkMethod: ({ row }) => row.readTime === null },
  pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
  sortConfig: {
    remote: true,
    multiple: false,
    defaultSort: { field: 'createTime', order: 'desc' },
  },
  toolbarConfig: {
    refresh: true,
    refreshOptions: { code: 'query' },
    custom: true,
    search: true,
  },
  proxyConfig: {
    sort: true,
    ajax: {
      query: ({ page, sort }, values) => {
        const run = ++listVersion;
        failed.value = false;
        selectedIds.value = [];
        latestListQuery = (async (): Promise<GridResult> => {
          let parameters = listParameters(
            page.currentPage,
            page.pageSize,
            sort,
            values,
          );
          for (;;) {
            const requestRefresh = refreshVersion;
            let response:
              | Awaited<ReturnType<typeof listMyNotifications>>
              | undefined;
            let failure: unknown;
            try {
              response = await listMyNotifications(parameters);
            } catch (error) {
              failure = error;
            }
            if (run !== listVersion) return latestListQuery;
            if (gridApi.grid.getCurrentPage) {
              const submitted = gridApi.formApi.getLatestSubmissionValues();
              const current = listParameters(
                gridApi.grid.getCurrentPage(),
                gridApi.grid.getPageSize(),
                gridApi.grid.getSortColumns()[0],
                submitted,
              );
              if (JSON.stringify(current) !== JSON.stringify(parameters)) {
                parameters = current;
                continue;
              }
            }
            if (requestRefresh !== refreshVersion) continue;
            if (failure) {
              failed.value = true;
              throw failure;
            }
            if (!response) throw new Error('列表未返回结果');
            return response;
          }
        })();
        return latestListQuery;
      },
    },
  },
};
const [Grid, gridApi] = useVbenVxeGrid<PersonalNotification>({
  gridOptions,
  gridEvents: {
    checkboxChange: ({ records }: { records: PersonalNotification[] }) =>
      updateSelection(records),
    checkboxAll: ({ records }: { records: PersonalNotification[] }) =>
      updateSelection(records),
  },
  formOptions: {
    showCollapseButton: false,
    schema: [
      {
        fieldName: 'unreadOnly',
        component: 'Select',
        label: '通知状态',
        defaultValue: false,
        componentProps: {
          options: [
            { label: '全部', value: false },
            { label: '仅未读', value: true },
          ],
        },
      },
    ],
    handleSubmit: async () => {
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
    handleReset: async () => {
      await gridApi.formApi.resetForm();
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.clearSort();
      // eslint-disable-next-line unicorn/no-array-sort -- Native Vxe header API.
      await gridApi.grid.sort({ field: 'createTime', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
});
async function loadList() {
  refreshVersion++;
  await gridApi.query();
}
function updateSelection(selection: PersonalNotification[]) {
  selectedIds.value = selection
    .filter((item) => item.readTime === null)
    .map((item) => item.id);
}
const [DetailModal, detailModalApi] = useVbenModal({
  title: '通知详情',
  class: 'w-[min(680px,94vw)]',
  showConfirmButton: false,
  onOpenChange: (opened) => {
    detailVisible.value = opened;
    if (!opened) void closeDetail();
  },
});
watch(detailLoading, (loading) => detailModalApi.setState({ loading }));
async function openDetail(id: NotificationId) {
  const version = ++detailVersion;
  detailId.value = id;
  detail.value = undefined;
  detailFailed.value = false;
  detailVisible.value = true;
  detailModalApi.open();
  detailLoading.value = true;
  try {
    const result = await getMyNotification(id);
    if (version !== detailVersion) return;
    detail.value = result;
  } catch {
    if (version !== detailVersion) return;
    detailFailed.value = true;
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

function retryDetail() {
  if (detailId.value !== undefined) void openDetail(detailId.value);
}

function parseNotificationId(value: unknown): NotificationId | undefined {
  if (
    !['number', 'string'].includes(typeof value) ||
    !/^\d+$/.test(String(value))
  )
    return;
  const id = String(value);
  if (BigInt(id) <= 0n || BigInt(id) > 9_223_372_036_854_775_807n) return;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return;
  const numeric = Number(id);
  return Number.isSafeInteger(numeric) ? numeric : id;
}

watch(
  () =>
    props.notificationId ??
    (route.name === 'PersonalNotificationInbox'
      ? route.query.notificationId
      : undefined),
  (value) => {
    if (value === undefined) return;
    const id = parseNotificationId(value);
    if (id === undefined) {
      detailVersion += 1;
      detailLoading.value = false;
      detailVisible.value = true;
      detailModalApi.open();
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
  detailVersion += 1;
  detailLoading.value = false;
  detail.value = undefined;
  detailId.value = undefined;
  if (
    route.name === 'PersonalNotificationInbox' &&
    route.query.notificationId !== undefined
  ) {
    await router.replace({ name: 'PersonalNotificationInbox' });
  }
}

async function markOneRead(item: PersonalNotification) {
  if (item.readTime !== null || markingId.value !== undefined) return;
  markingId.value = item.id;
  try {
    await markMyNotificationRead(item.id);
    ElMessage.success('已标记为已读');
    const version = detailVersion;
    const refreshDetail =
      detailId.value === item.id
        ? getMyNotification(item.id).then((value) => {
            if (version === detailVersion && detailId.value === item.id)
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
    if (router.currentRoute.value.name === resolution.name) {
      emit('navigate');
    } else {
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
</script>

<template>
  <section class="min-w-0" aria-label="通知中心">
    <el-alert
      v-if="failed"
      title="通知加载失败，请重试"
      type="error"
      closable
      class="mb-3"
    >
      <el-button @click="loadList">重新加载</el-button>
    </el-alert>
    <Grid table-title="收件箱">
      <template #toolbar-actions>
        <el-button
          :disabled="selectedIds.length === 0"
          :loading="markingBatch"
          type="primary"
          @click="markSelectedRead"
        >
          批量标记已读（{{ selectedIds.length }}）
        </el-button>
      </template>
      <template #readState="{ row }">
        <el-tag :type="row.readTime === null ? 'warning' : 'info'">
          {{ row.readTime === null ? '未读' : '已读' }}
        </el-tag>
      </template>
      <template #actions="{ row }">
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
    </Grid>
    <DetailModal>
      <el-alert
        v-if="detailFailed"
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
        <p class="mb-4 text-sm text-muted-foreground">
          收到时间：{{ formatTime(detail.createTime) }}
        </p>
        <div class="whitespace-pre-wrap break-words leading-7">
          {{ detail.body }}
        </div>
        <div class="mt-5 rounded bg-muted p-3 text-sm text-muted-foreground">
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
        <el-button @click="detailModalApi.close()">关闭</el-button>
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
    </DetailModal>
  </section>
</template>
