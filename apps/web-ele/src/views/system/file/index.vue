<script lang="ts" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { OssFile } from '#/api/system/file';

import { onBeforeUnmount, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  downloadFile,
  getFileList,
  removeFiles,
  uploadFile,
} from '#/api/system/file';

import { formatFileSize } from './file-size';

const { hasAccessByCodes } = useAccess();
const canUpload = () => hasAccessByCodes(['system:oss:upload']);
const canRemove = () => hasAccessByCodes(['system:oss:remove']);
const canDownload = () => hasAccessByCodes(['system:oss:download']);
const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_SUFFIXES = new Set([
  'csv',
  'doc',
  'docx',
  'gif',
  'jpeg',
  'jpg',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'txt',
  'webp',
  'xls',
  'xlsx',
  'zip',
]);

const selectedIds = ref<string[]>([]);
const uploading = ref(false);
const uploadProgress = ref(0);
const failed = ref(false);
let generation = 0;
let refreshVersion = 0;
type GridResult = { items: OssFile[]; total: number };
let latestQuery: Promise<GridResult> = Promise.resolve({ items: [], total: 0 });
onBeforeUnmount(() => {
  generation++;
  latestQuery = Promise.resolve({ items: [], total: 0 });
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
    originalName: String(values.originalName ?? '') || undefined,
    fileSuffix: String(values.fileSuffix ?? '') || undefined,
    orderBy: sort?.order ? sort.field : 'createTime',
    order: sort?.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}
const gridOptions: VxeTableGridOptions<OssFile> = {
  height: 'auto',
  rowConfig: { keyField: 'ossId' },
  columns: [
    { type: 'checkbox', width: 50 },
    {
      field: 'originalName',
      title: '文件名',
      minWidth: 250,
      sortable: true,
      formatter: ({ row }) => displayFileName(row),
    },
    { field: 'fileSuffix', title: '类型', width: 90, sortable: true },
    {
      field: 'size',
      title: '大小',
      width: 130,
      sortable: true,
      formatter: ({ row }) => formatFileSize(row.size),
    },
    { field: 'createTime', title: '上传时间', minWidth: 180, sortable: true },
    { field: 'ossId', title: '文件编号', minWidth: 190, sortable: true },
    {
      field: 'actions',
      title: '操作',
      width: 220,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ],
  pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
  sortConfig: {
    remote: true,
    multiple: false,
    defaultSort: { field: 'createTime', order: 'desc' },
  },
  toolbarConfig: {
    custom: true,
    refresh: true,
    refreshOptions: { code: 'query' },
    search: true,
    zoom: true,
  },
  proxyConfig: {
    sort: true,
    ajax: {
      query: ({ page, sort }, values) => {
        const run = ++generation;
        failed.value = false;
        selectedIds.value = [];
        latestQuery = (async (): Promise<GridResult> => {
          if (!hasAccessByCodes(['system:oss:list']))
            return { items: [], total: 0 };
          let parameters = listParameters(
            page.currentPage,
            page.pageSize,
            sort,
            values,
          );
          for (;;) {
            const requestRefresh = refreshVersion;
            let response: Awaited<ReturnType<typeof getFileList>> | undefined;
            let failure: unknown;
            try {
              response = await getFileList(parameters);
            } catch (error) {
              failure = error;
            }
            if (run !== generation) return latestQuery;
            if (!hasAccessByCodes(['system:oss:list']))
              return { items: [], total: 0 };
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
            const total = Number(response.total);
            if (
              (typeof response.total === 'string' &&
                !/^\d+$/.test(response.total)) ||
              !Number.isSafeInteger(total) ||
              total < 0
            )
              throw new Error('列表总数格式不正确');
            return { items: response.records, total };
          }
        })();
        return latestQuery;
      },
    },
  },
};
const [Grid, gridApi] = useVbenVxeGrid<OssFile>({
  gridOptions,
  gridEvents: {
    checkboxChange: ({ records }) => handleSelectionChange(records),
    checkboxAll: ({ records }) => handleSelectionChange(records),
  },
  formOptions: {
    showCollapseButton: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'originalName',
        component: 'Input',
        label: '文件名',
        componentProps: { clearable: true },
      },
      {
        fieldName: 'fileSuffix',
        component: 'Select',
        label: '文件类型',
        componentProps: {
          clearable: true,
          options: [
            { label: 'PDF', value: 'pdf' },
            { label: 'Word', value: 'docx' },
            { label: 'Excel', value: 'xlsx' },
            { label: '图片 JPG', value: 'jpg' },
            { label: '图片 PNG', value: 'png' },
            { label: 'ZIP', value: 'zip' },
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
async function getList() {
  refreshVersion++;
  await gridApi.query();
}

// 上传文件
const handleUpload = async (options: any) => {
  if (uploading.value) return;
  const file: File = options.file;
  const suffix = file.name.split('.').pop()?.toLowerCase() || '';
  if (
    !ALLOWED_SUFFIXES.has(suffix) ||
    file.size === 0 ||
    file.size > MAX_SIZE
  ) {
    ElMessage.error('仅支持指定类型且不超过 20 MB 的非空文件');
    options.onError?.(new Error('文件类型或大小不符合要求'));
    return;
  }
  uploading.value = true;
  uploadProgress.value = 0;
  try {
    const saved = await uploadFile(file, (percent) => {
      uploadProgress.value = percent;
    });
    if (!saved?.ossId) throw new Error('服务器未返回文件编号');
    options.onSuccess?.(saved);
    ElMessage.success('上传成功');
    await gridApi.query();
  } catch (error) {
    options.onError?.(error);
    ElMessage.error('上传失败');
  } finally {
    uploading.value = false;
  }
};

const handleDelete = (row: OssFile) => {
  ElMessageBox.confirm(`确定要删除文件"${row.originalName}"吗？`, '警告', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  })
    .then(async () => {
      try {
        await removeFiles([row.ossId]);
        ElMessage.success('删除成功');
        getList();
      } catch {
        ElMessage.error('删除失败');
      }
    })
    .catch(() => {});
};

// 批量删除
const handleBatchDelete = () => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请选择要删除的文件');
    return;
  }
  ElMessageBox.confirm(
    `确定要删除选中的${selectedIds.value.length}个文件吗？`,
    '警告',
    {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    },
  )
    .then(async () => {
      try {
        await removeFiles(selectedIds.value);
        ElMessage.success('批量删除成功');
        selectedIds.value = [];
        getList();
      } catch {
        ElMessage.error('批量删除失败');
      }
    })
    .catch(() => {});
};

const handleDownload = async (row: OssFile) => {
  try {
    const blob = await downloadFile(row.ossId);
    if (blob.type.includes('json')) {
      const payload = JSON.parse(await blob.text());
      throw new Error(payload.message || '下载失败');
    }
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = row.originalName;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载失败');
  }
};

const copyFileId = async (row: OssFile) => {
  try {
    await navigator.clipboard.writeText(row.ossId);
    ElMessage.success('文件编号已复制，可用于业务记录引用');
  } catch {
    ElMessage.error('复制失败，请手动复制文件编号');
  }
};

const handleSelectionChange = (selection: OssFile[]) => {
  selectedIds.value = selection.map((item) => item.ossId);
};

// 获取文件类型图标
const getFileIcon = (ext: string) => {
  const iconMap: Record<string, string> = {
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    webp: '🖼️',
    mp4: '🎬',
    avi: '🎬',
    mov: '🎬',
    mkv: '🎬',
    mp3: '🎵',
    wav: '🎵',
    flac: '🎵',
    pdf: '📑',
    doc: '📝',
    docx: '📝',
    xls: '📊',
    xlsx: '📊',
    zip: '📦',
    rar: '📦',
    '7z': '📦',
    default: '📄',
  };
  return iconMap[ext?.toLowerCase()] || iconMap.default;
};

const displayFileName = (row: OssFile) =>
  `${getFileIcon(row.fileSuffix)} ${row.originalName}`;
</script>

<template>
  <Page title="文件管理" description="管理系统上传的文件" auto-content-height>
    <template #extra>
      <el-upload
        v-if="canUpload()"
        :show-file-list="false"
        :http-request="handleUpload"
        :disabled="uploading"
      >
        <el-button type="primary" :loading="uploading">
          {{ uploading ? `上传中 ${uploadProgress}%` : '上传文件' }}
        </el-button>
      </el-upload>
    </template>
    <el-alert
      v-if="failed"
      title="文件列表加载失败，请重试"
      type="error"
      closable
      class="mb-3"
    >
      <el-button @click="getList">重试</el-button>
    </el-alert>
    <el-alert
      v-if="!hasAccessByCodes(['system:oss:list'])"
      title="没有文件列表权限"
      type="warning"
      :closable="false"
    />
    <Grid v-else table-title="文件列表">
      <template #toolbar-actions>
        <el-button
          v-if="canRemove()"
          type="danger"
          :disabled="selectedIds.length === 0"
          @click="handleBatchDelete"
        >
          批量删除
        </el-button>
      </template>
      <template #actions="{ row }">
        <el-button type="primary" link @click="copyFileId(row)">
          复制编号
        </el-button>
        <el-button
          v-if="canDownload()"
          type="primary"
          link
          @click="handleDownload(row)"
        >
          下载
        </el-button>
        <el-button
          v-if="canRemove()"
          type="danger"
          link
          @click="handleDelete(row)"
        >
          删除
        </el-button>
      </template>
    </Grid>
  </Page>
</template>
