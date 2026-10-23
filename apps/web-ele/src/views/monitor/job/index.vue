<script lang="ts" setup>
import type { JobChangePayload, JobFire, JobInfo } from '#/api/monitor/job';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  addJob,
  changeJobStatus,
  getJob,
  getJobFires,
  getJobHandlers,
  getJobList,
  removeJob,
  runJob,
  updateJob,
} from '#/api/monitor/job';
import AdminPageHeader from '#/components/admin-page-header.vue';
import { DICT_TYPE, useDictionary } from '#/composables/use-dictionary';

const jobStatusDict = useDictionary(DICT_TYPE.JOB_STATUS);
const jobStatusOptions = jobStatusDict.options;
const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);

const filters = reactive({ jobName: '', jobGroup: '', status: '' });
const pagination = reactive({ pageNum: 1, pageSize: 10 });
const jobs = ref<JobInfo[]>([]);
const selectedIds = ref<string[]>([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const formOpen = ref(false);
const editingId = ref<string>();
const handlers = ref<string[]>([]);
const handlersLoading = ref(false);
const firesOpen = ref(false);
const firesLoading = ref(false);
const fires = ref<JobFire[]>([]);
const firesJobName = ref('');

function initialForm(): JobChangePayload {
  return {
    jobName: '',
    jobGroup: 'DEFAULT',
    handlerKey: '',
    handlerParams: '{}',
    cronExpression: '0 */5 * * * ?',
    timeZone: 'Asia/Shanghai',
    misfirePolicy: '3',
    concurrent: '1',
    status: '1',
    remark: '',
  };
}
const form = reactive<JobChangePayload>(initialForm());

const groups = [
  { label: '默认', value: 'DEFAULT' },
  { label: '系统', value: 'SYSTEM' },
];

async function loadJobs() {
  loading.value = true;
  try {
    const result = await getJobList({ ...pagination, ...filters });
    jobs.value = result.rows || result.records || [];
    total.value = Number(result.total) || 0;
    await jobStatusDict.ensureLabels(jobs.value.map((job) => job.status));
  } catch {
    ElMessage.error('获取任务列表失败');
  } finally {
    loading.value = false;
  }
}

async function retryJobStatuses() {
  await jobStatusDict.load();
  await loadJobs();
}

function search() {
  pagination.pageNum = 1;
  void loadJobs();
}

function reset() {
  filters.jobName = '';
  filters.jobGroup = '';
  filters.status = '';
  search();
}

async function loadHandlers() {
  handlersLoading.value = true;
  try {
    handlers.value = await getJobHandlers();
  } catch {
    handlers.value = [];
    ElMessage.error('获取受控处理器失败');
  } finally {
    handlersLoading.value = false;
  }
}

async function openForm(row?: JobInfo) {
  editingId.value = row?.jobId;
  Object.assign(form, initialForm());
  if (row) {
    try {
      const detail = await getJob(row.jobId);
      Object.assign(form, {
        jobId: detail.jobId,
        jobName: detail.jobName,
        jobGroup: detail.jobGroup,
        handlerKey: detail.handlerKey || '',
        handlerParams: detail.handlerParams || '{}',
        cronExpression: detail.cronExpression,
        timeZone: detail.timeZone || 'Asia/Shanghai',
        misfirePolicy: detail.misfirePolicy,
        concurrent: detail.concurrent,
        status: detail.status,
        remark: detail.remark || '',
      });
    } catch {
      ElMessage.error('获取任务详情失败');
      return;
    }
  }
  await loadHandlers();
  formOpen.value = true;
}

async function saveJob() {
  if (
    !form.jobName.trim() ||
    !form.jobGroup.trim() ||
    !form.handlerKey ||
    !form.cronExpression.trim() ||
    !form.timeZone.trim()
  ) {
    ElMessage.warning('请填写任务名称、任务组、处理器、Cron 和时区');
    return;
  }
  try {
    const parsed: unknown = JSON.parse(form.handlerParams || '{}');
    if (
      parsed === null ||
      Array.isArray(parsed) ||
      typeof parsed !== 'object'
    ) {
      throw new Error('JSON object required');
    }
  } catch {
    ElMessage.warning('处理器参数必须是 JSON 对象');
    return;
  }
  saving.value = true;
  try {
    const payload = { ...form, jobId: editingId.value };
    await (editingId.value ? updateJob(payload) : addJob(payload));
    formOpen.value = false;
    ElMessage.success('保存成功');
    await loadJobs();
  } catch {
    ElMessage.error('保存失败，请检查处理器参数、Cron 和时区');
  } finally {
    saving.value = false;
  }
}

async function deleteJobs(ids: string[], label: string) {
  try {
    await ElMessageBox.confirm(`确定要删除${label}吗？`, '警告', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await removeJob(ids.join(','));
    ElMessage.success('删除成功');
    selectedIds.value = [];
    await loadJobs();
  } catch {
    ElMessage.error('删除失败');
  }
}

function deleteSelected() {
  if (selectedIds.value.length > 0) {
    void deleteJobs(
      selectedIds.value,
      `选中的 ${selectedIds.value.length} 条任务`,
    );
  }
}

async function toggleStatus(row: JobInfo) {
  const next = row.status === '0' ? '1' : '0';
  try {
    await changeJobStatus(row.jobId, next);
    ElMessage.success(next === '0' ? '任务已启用' : '任务已暂停');
    await loadJobs();
  } catch {
    ElMessage.error('修改任务状态失败');
  }
}

async function runNow(row: JobInfo) {
  try {
    const fireId = await runJob(row.jobId);
    ElMessage.success(`已提交执行，记录 ID：${fireId}`);
  } catch {
    ElMessage.error('手动执行失败');
  }
}

async function openFires(row: JobInfo) {
  firesOpen.value = true;
  firesJobName.value = row.jobName;
  firesLoading.value = true;
  try {
    fires.value = await getJobFires(row.jobId);
  } catch {
    fires.value = [];
    ElMessage.error('获取执行记录失败');
  } finally {
    firesLoading.value = false;
  }
}

onMounted(() => {
  void jobStatusDict.load().then(loadJobs);
});
</script>

<template>
  <Page content-class="admin-page">
    <AdminPageHeader
      title="定时任务"
      description="配置受控处理器并查看调度执行结果"
    >
      <template #actions>
        <el-button
          v-if="can('monitor:job:remove')"
          type="danger"
          :disabled="selectedIds.length === 0"
          @click="deleteSelected"
        >
          批量删除
        </el-button>
        <el-button
          v-if="can('monitor:job:add')"
          type="primary"
          @click="openForm()"
        >
          新增任务
        </el-button>
      </template>
    </AdminPageHeader>
    <el-alert
      v-if="jobStatusDict.error.value"
      class="mb-4"
      title="任务状态字典加载失败，状态筛选暂不可用"
      type="error"
      show-icon
    >
      <template #default>
        <el-button link type="primary" @click="retryJobStatuses">
          重新加载
        </el-button>
      </template>
    </el-alert>

    <el-card shadow="never">
      <el-form :inline="true" :model="filters">
        <el-form-item label="任务名称">
          <el-input v-model="filters.jobName" clearable @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="任务组">
          <el-select v-model="filters.jobGroup" clearable style="width: 120px">
            <el-option
              v-for="item in groups"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filters.status"
            clearable
            style="width: 100px"
            :loading="jobStatusDict.loading.value"
            :disabled="jobStatusDict.error.value"
          >
            <el-option
              v-for="item in jobStatusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table
        v-loading="loading"
        :data="jobs"
        stripe
        @selection-change="
          (selection: JobInfo[]) =>
            (selectedIds = selection.map((item) => item.jobId))
        "
      >
        <el-table-column
          v-if="can('monitor:job:remove')"
          type="selection"
          width="50"
        />
        <el-table-column prop="jobId" label="任务 ID" width="90" />
        <el-table-column prop="jobName" label="任务名称" min-width="150" />
        <el-table-column prop="jobGroup" label="任务组" width="110" />
        <el-table-column label="受控处理器" min-width="190">
          <template #default="{ row }">
            {{ row.handlerKey || '未绑定（旧任务已暂停）' }}
          </template>
        </el-table-column>
        <el-table-column prop="cronExpression" label="Cron" width="160" />
        <el-table-column prop="timeZone" label="时区" width="140" />
        <el-table-column
          prop="nextFireTime"
          label="下次执行（UTC）"
          width="185"
        />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '0' ? 'success' : 'info'">
              {{ jobStatusDict.label(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="310" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="can('monitor:job:edit')"
              type="primary"
              link
              size="small"
              @click="openForm(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="can('monitor:job:changeStatus') && row.handlerKey"
              type="primary"
              link
              size="small"
              @click="toggleStatus(row)"
            >
              {{ row.status === '0' ? '暂停' : '启用' }}
            </el-button>
            <el-button
              v-if="can('monitor:job:run')"
              type="primary"
              link
              size="small"
              :disabled="row.status !== '0' || !row.handlerKey"
              @click="runNow(row)"
            >
              执行
            </el-button>
            <el-button
              v-if="can('monitor:job:query')"
              type="primary"
              link
              size="small"
              @click="openFires(row)"
            >
              记录
            </el-button>
            <el-button
              v-if="can('monitor:job:remove')"
              type="danger"
              link
              size="small"
              @click="deleteJobs([row.jobId], `任务“${row.jobName}”`)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="pagination.pageNum"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @change="loadJobs"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="formOpen"
      :title="editingId ? '编辑任务' : '新增任务'"
      width="650px"
      destroy-on-close
    >
      <el-form :model="form" label-width="125px">
        <el-form-item label="任务名称" required>
          <el-input v-model="form.jobName" maxlength="64" />
        </el-form-item>
        <el-form-item label="任务组" required>
          <el-input v-model="form.jobGroup" maxlength="64" />
        </el-form-item>
        <el-form-item label="受控处理器" required>
          <el-select
            v-model="form.handlerKey"
            class="w-full"
            :loading="handlersLoading"
            placeholder="选择已注册的处理器"
          >
            <el-option
              v-for="key in handlers"
              :key="key"
              :label="key"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="处理器参数">
          <el-input
            v-model="form.handlerParams"
            type="textarea"
            :rows="3"
            placeholder="JSON 对象，例如 {}"
          />
        </el-form-item>
        <el-form-item label="六段 Cron" required>
          <el-input
            v-model="form.cronExpression"
            placeholder="例如 0 */5 * * * ?"
          />
        </el-form-item>
        <el-form-item label="IANA 时区" required>
          <el-input v-model="form.timeZone" placeholder="例如 Asia/Shanghai" />
        </el-form-item>
        <el-form-item label="错过执行">
          <el-radio-group v-model="form.misfirePolicy">
            <el-radio value="3">跳过</el-radio>
            <el-radio value="2">补执行一次</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="重叠执行">
          <el-radio-group v-model="form.concurrent">
            <el-radio value="1">跳过重叠</el-radio>
            <el-radio value="0">允许并行</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!editingId" label="创建后状态">
          <el-radio-group v-model="form.status">
            <el-radio value="1">暂停</el-radio>
            <el-radio value="0">启用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            maxlength="500"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveJob">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="firesOpen"
      :title="`${firesJobName} · 最近执行记录`"
      width="850px"
    >
      <el-table v-loading="firesLoading" :data="fires" max-height="450">
        <el-table-column prop="fireId" label="记录 ID" width="105" />
        <el-table-column prop="triggerType" label="触发" width="100" />
        <el-table-column
          prop="scheduledFireTime"
          label="计划时间（UTC）"
          width="185"
        />
        <el-table-column prop="status" label="结果" width="105" />
        <el-table-column prop="attemptCount" label="尝试" width="65" />
        <el-table-column
          prop="completedAt"
          label="完成时间（UTC）"
          width="185"
        />
        <el-table-column prop="resultSummary" label="说明" min-width="120" />
      </el-table>
    </el-dialog>
  </Page>
</template>
