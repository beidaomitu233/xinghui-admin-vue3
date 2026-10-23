<script lang="ts" setup>
import type { OssFile } from '#/api/system/file';

import { onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  downloadFile,
  getFileList,
  removeFiles,
  uploadFile,
} from '#/api/system/file';
import AdminPageHeader from '#/components/admin-page-header.vue';

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

// 搜索表单
const formInline = reactive({
  originalName: '',
  fileSuffix: '',
});

// 表格数据
const tableData = ref<OssFile[]>([]);
const total = ref(0);
const loading = ref(false);
const selectedIds = ref<string[]>([]);
const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
});

// 上传
const uploading = ref(false);
const uploadProgress = ref(0);

// 获取文件列表
const getList = async () => {
  loading.value = true;
  try {
    const res = await getFileList({ ...queryParams, ...formInline });
    tableData.value = res.records;
    total.value = Number(res.total);
  } catch {
    tableData.value = [];
    total.value = 0;
    ElMessage.error('获取文件列表失败');
  } finally {
    loading.value = false;
  }
};

// 搜索
const handleSearch = () => {
  queryParams.pageNum = 1;
  getList();
};

// 重置搜索
const handleReset = () => {
  formInline.originalName = '';
  formInline.fileSuffix = '';
  handleSearch();
};

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
    queryParams.pageNum = 1;
    await getList();
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

// 分页变化
const handlePageChange = () => {
  getList();
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

onMounted(() => {
  getList();
});
</script>

<template>
  <Page content-class="admin-page">
    <AdminPageHeader title="文件管理" description="管理系统上传的文件">
      <template #actions>
        <el-button
          v-if="canRemove()"
          type="danger"
          :disabled="selectedIds.length === 0"
          @click="handleBatchDelete"
        >
          批量删除
        </el-button>
        <el-upload
          v-if="canUpload()"
          :show-file-list="false"
          :http-request="handleUpload"
          :disabled="uploading"
          class="ml-2 inline-block"
        >
          <el-button type="primary" :loading="uploading">
            {{ uploading ? `上传中 ${uploadProgress}%` : '上传文件' }}
          </el-button>
        </el-upload>
      </template>
    </AdminPageHeader>
    <!-- 搜索区域 -->
    <el-card shadow="never">
      <el-form :inline="true" :model="formInline">
        <el-form-item label="文件名">
          <el-input
            v-model="formInline.originalName"
            placeholder="请输入文件名"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="文件类型">
          <el-select
            v-model="formInline.fileSuffix"
            placeholder="请选择类型"
            clearable
            style="width: 120px"
          >
            <el-option label="PDF" value="pdf" />
            <el-option label="Word" value="docx" />
            <el-option label="Excel" value="xlsx" />
            <el-option label="图片 JPG" value="jpg" />
            <el-option label="图片 PNG" value="png" />
            <el-option label="ZIP" value="zip" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 操作区域 -->
    <el-card shadow="never">
      <!-- 表格 -->
      <el-table
        v-loading="loading"
        :data="tableData"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="originalName" label="文件名" min-width="250">
          <template #default="{ row }">
            <span>{{ displayFileName(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="fileSuffix"
          label="类型"
          width="80"
          align="center"
        >
          <template #default="{ row }">
            <el-tag size="small">{{ row.fileSuffix?.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="size" label="大小" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="上传时间" width="180" />
        <el-table-column prop="ossId" label="文件编号" width="190" />
        <el-table-column label="操作" width="215" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="copyFileId(row)"
            >
              复制编号
            </el-button>
            <el-button
              v-if="canDownload()"
              type="primary"
              link
              size="small"
              @click="handleDownload(row)"
            >
              下载
            </el-button>
            <el-button
              v-if="canRemove()"
              type="danger"
              link
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="queryParams.pageNum"
          v-model:page-size="queryParams.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @change="handlePageChange"
        />
      </div>
    </el-card>
  </Page>
</template>

<style scoped>
.el-card {
  border-radius: 8px;
}
</style>
