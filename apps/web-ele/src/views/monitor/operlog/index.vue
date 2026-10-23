<script lang="ts" setup>
import type { InputInstance } from 'element-plus';

import type { OperLogInfo } from '#/api/monitor/operlog';

import { onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { ElMessage } from 'element-plus';

import {
  cleanOperLog,
  getOperLogList,
  removeOperLog,
} from '#/api/monitor/operlog';
import AdminPageHeader from '#/components/admin-page-header.vue';
import { useConfirmedAction } from '#/composables/use-confirmed-action';
import { usePagedList } from '#/composables/use-paged-list';

const { hasAccessByCodes } = useAccess();
const canRemove = () => hasAccessByCodes(['monitor:operlog:remove']);
const canClean = () => hasAccessByCodes(['monitor:operlog:clean']);
const { busy: deleting, run: confirmAction } = useConfirmedAction();

// 搜索表单
const formInline = reactive({
  title: '',
  operName: '',
  businessType: '' as '' | number,
  status: '' as '' | number,
});
const titleInput = ref<InputInstance>();
const operNameInput = ref<InputInstance>();

const selectedIds = ref<string[]>([]);
const {
  error,
  load,
  loading,
  pageNum,
  pageSize,
  records: tableData,
  reloadAfterDelete,
  reset,
  search,
  setPage,
  setPageSize,
  setSort,
  total,
} = usePagedList<OperLogInfo, typeof formInline>({
  filters: formInline,
  orderBy: 'operTime',
  fetch: ({ businessType, status, ...query }) =>
    getOperLogList({
      ...query,
      businessType: businessType === '' ? undefined : businessType,
      status: status === '' ? undefined : status,
      orderBy: 'operTime',
    }),
});

// 详情弹窗
const detailVisible = ref(false);
const detailData = ref<null | OperLogInfo>(null);

// 业务类型映射
const businessTypeMap: Record<number, string> = {
  0: '其它',
  1: '新增',
  2: '修改',
  3: '删除',
  4: '授权',
  5: '导出',
  6: '导入',
  7: '强退',
  8: '生成代码',
  9: '清空数据',
};

const handleSearch = () => {
  formInline.title = titleInput.value?.input?.value ?? formInline.title;
  formInline.operName =
    operNameInput.value?.input?.value ?? formInline.operName;
  return search();
};

const handleReset = () => {
  reset(() => {
    formInline.title = '';
    formInline.operName = '';
    formInline.businessType = '';
    formInline.status = '';
  });
};

// 查看详情
const handleDetail = (row: OperLogInfo) => {
  detailData.value = row;
  detailVisible.value = true;
};

// 删除
const handleDelete = async () => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请选择要删除的日志');
    return;
  }
  await confirmAction({
    allowed: canRemove(),
    message: `确定要删除选中的${selectedIds.value.length}条日志吗？`,
    action: () => removeOperLog([...selectedIds.value]),
    successMessage: '删除成功',
    onSuccess: async () => {
      const deletedCount = selectedIds.value.length;
      selectedIds.value = [];
      await reloadAfterDelete(deletedCount);
    },
  });
};

const handleClean = async () => {
  await confirmAction({
    allowed: canClean(),
    message: '确定要清空所有操作日志吗？此操作不可恢复！',
    action: cleanOperLog,
    successMessage: '清空成功',
    onSuccess: () => setPage(1),
  });
};

const handleSelectionChange = (selection: OperLogInfo[]) => {
  selectedIds.value = selection.map((item) => item.operId);
};

const handleSortChange = (event: {
  order: 'ascending' | 'descending' | null;
  prop: string;
}) => {
  if (event.prop === 'operTime') setSort(event.order);
};

// 获取业务类型名称
const getBusinessTypeName = (type: number) => {
  return businessTypeMap[type] || '未知';
};

// 获取业务类型标签颜色
const getBusinessTypeColor = (type: number) => {
  const colorMap: Record<
    number,
    'danger' | 'info' | 'primary' | 'success' | 'warning'
  > = {
    1: 'success',
    2: 'warning',
    3: 'danger',
    4: 'primary',
    5: 'info',
    6: 'info',
  };
  return colorMap[type] || 'info';
};

onMounted(() => {
  load();
});
</script>

<template>
  <Page content-class="admin-page">
    <AdminPageHeader title="操作日志" description="查看系统操作日志记录">
      <template #actions>
        <el-button
          v-if="canRemove()"
          type="danger"
          :loading="deleting"
          :disabled="selectedIds.length === 0"
          @click="handleDelete"
        >
          删除
        </el-button>
        <el-button
          v-if="canClean()"
          type="danger"
          :loading="deleting"
          @click="handleClean"
        >
          清空
        </el-button>
      </template>
    </AdminPageHeader>
    <!-- 搜索区域 -->
    <el-card shadow="never">
      <el-form :inline="true" :model="formInline">
        <el-form-item label="系统模块">
          <el-input
            ref="titleInput"
            v-model="formInline.title"
            placeholder="请输入系统模块"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="操作人员">
          <el-input
            ref="operNameInput"
            v-model="formInline.operName"
            placeholder="请输入操作人员"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select
            v-model="formInline.businessType"
            placeholder="请选择类型"
            clearable
            style="width: 120px"
          >
            <el-option
              v-for="(name, type) in businessTypeMap"
              :key="type"
              :label="name"
              :value="Number(type)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="formInline.status"
            placeholder="请选择状态"
            clearable
            style="width: 100px"
          >
            <el-option label="成功" :value="0" />
            <el-option label="失败" :value="1" />
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
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        closable
        class="mb-4"
      >
        <el-button type="primary" link @click="load">重试</el-button>
      </el-alert>

      <!-- 表格 -->
      <el-table
        v-loading="loading"
        :data="tableData"
        stripe
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      >
        <el-table-column v-if="canRemove()" type="selection" width="50" />
        <el-table-column prop="operId" label="日志ID" width="80" />
        <el-table-column prop="title" label="系统模块" min-width="120" />
        <el-table-column
          prop="businessType"
          label="操作类型"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <el-tag :type="getBusinessTypeColor(row.businessType)">
              {{ getBusinessTypeName(row.businessType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operName" label="操作人员" width="120" />
        <el-table-column prop="operIp" label="操作IP" width="140" />
        <el-table-column prop="status" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'">
              {{ row.status === 0 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="operTime"
          label="操作时间"
          width="180"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="handleDetail(row)"
            >
              详情
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="error ? '数据加载失败' : '暂无操作日志'" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="mt-4 flex justify-end">
        <el-pagination
          :current-page="pageNum"
          :page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="setPage"
          @size-change="setPageSize"
        />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog
      v-if="detailData"
      v-model="detailVisible"
      title="操作日志详情"
      width="700px"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="操作模块">
          {{ detailData.title }}
        </el-descriptions-item>
        <el-descriptions-item label="操作类型">
          <el-tag :type="getBusinessTypeColor(detailData.businessType)">
            {{ getBusinessTypeName(detailData.businessType) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="请求方式">
          {{ detailData.requestMethod }}
        </el-descriptions-item>
        <el-descriptions-item label="操作人员">
          {{ detailData.operName }}
        </el-descriptions-item>
        <el-descriptions-item label="部门名称">
          {{ detailData.deptName }}
        </el-descriptions-item>
        <el-descriptions-item label="操作IP">
          {{ detailData.operIp }}
        </el-descriptions-item>
        <el-descriptions-item label="操作地点">
          {{ detailData.operLocation }}
        </el-descriptions-item>
        <el-descriptions-item label="操作状态">
          <el-tag :type="detailData.status === 0 ? 'success' : 'danger'">
            {{ detailData.status === 0 ? '成功' : '失败' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作时间" :span="2">
          {{ detailData.operTime }}
        </el-descriptions-item>
        <el-descriptions-item label="操作方法" :span="2">
          {{ detailData.method }}
        </el-descriptions-item>
        <el-descriptions-item label="请求URL" :span="2">
          {{ detailData.operUrl }}
        </el-descriptions-item>
        <el-descriptions-item label="请求参数" :span="2">
          <div class="max-h-32 overflow-auto">{{ detailData.operParam }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="返回参数" :span="2">
          <div class="max-h-32 overflow-auto">{{ detailData.jsonResult }}</div>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="detailData.status === 1"
          label="错误消息"
          :span="2"
        >
          <span class="text-red-500">{{ detailData.errorMsg }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </Page>
</template>

<style scoped>
.el-card {
  border-radius: 8px;
}
</style>
