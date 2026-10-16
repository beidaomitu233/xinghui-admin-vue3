<script lang="ts" setup>
import type {
  AiModelChange,
  AiModelConfig,
  AiModelPage,
  ModelTestResult,
} from '#/api/system/ai-model';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  createAiModel,
  getAiModel,
  listAiModels,
  removeAiModel,
  saveAiModelCredential,
  setAiModelEnabled,
  testAiModel,
  updateAiModel,
} from '#/api/system/ai-model';

const accessStore = useAccessStore();
const can = (permission: string) =>
  accessStore.accessCodes.includes(permission);
const page = ref<AiModelPage>({
  records: [],
  total: 0,
  pageNum: 1,
  pageSize: 10,
});
const loading = ref(false);
const failed = ref(false);
const saving = ref(false);
const statusChangingId = ref<number>();
const dialogVisible = ref(false);
const detailVisible = ref(false);
const editing = ref<AiModelConfig>();
const detail = ref<AiModelConfig>();
const credentialVisible = ref(false);
const credentialTarget = ref<AiModelConfig>();
const credentialSaving = ref(false);
const credentialForm = reactive({
  mode: 'DB' as 'DB' | 'ENV',
  apiKey: '',
  clearKey: false,
});
const testVisible = ref(false);
const testResult = ref<ModelTestResult>();
const testingId = ref<number>();
const query = reactive({
  providerCode: '',
  modelCode: '',
  enabled: '' as '' | 'false' | 'true',
  pageNum: 1,
  pageSize: 10,
});
const form = reactive({
  providerCode: '',
  modelCode: '',
  endpointUrl: '',
  credentialEnvName: '',
  timeoutSeconds: 30,
});

async function load() {
  if (!can('ai:model:list')) return;
  loading.value = true;
  failed.value = false;
  try {
    page.value = await listAiModels({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      ...(query.providerCode.trim()
        ? { providerCode: query.providerCode.trim() }
        : {}),
      ...(query.modelCode.trim() ? { modelCode: query.modelCode.trim() } : {}),
      ...(query.enabled ? { enabled: query.enabled === 'true' } : {}),
    });
  } catch {
    page.value = { ...page.value, records: [], total: 0 };
    failed.value = true;
    ElMessage.error('加载模型配置失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  query.pageNum = 1;
  void load();
}

function resetSearch() {
  query.providerCode = '';
  query.modelCode = '';
  query.enabled = '';
  search();
}

function onPageChange(pageNum: number) {
  query.pageNum = pageNum;
  void load();
}

function onPageSizeChange(pageSize: number) {
  query.pageSize = pageSize;
  query.pageNum = 1;
  void load();
}

function openCreate() {
  editing.value = undefined;
  Object.assign(form, {
    providerCode: '',
    modelCode: '',
    endpointUrl: '',
    credentialEnvName: '',
    timeoutSeconds: 30,
  });
  dialogVisible.value = true;
}

async function openEdit(row: AiModelConfig) {
  let latest = row;
  if (can('ai:model:query')) {
    try {
      latest = await getAiModel(row.id);
    } catch {
      return;
    }
  }
  editing.value = latest;
  Object.assign(form, {
    providerCode: latest.providerCode,
    modelCode: latest.modelCode,
    endpointUrl: latest.endpointUrl,
    credentialEnvName: latest.credentialEnvName ?? '',
    timeoutSeconds: latest.timeoutSeconds,
  });
  dialogVisible.value = true;
}

async function showDetail(row: AiModelConfig) {
  try {
    detail.value = await getAiModel(row.id);
    detailVisible.value = true;
  } catch {
    // The shared request interceptor shows the service error.
  }
}

async function save() {
  const data: AiModelChange = {
    providerCode: form.providerCode.trim().toLowerCase(),
    modelCode: form.modelCode.trim(),
    endpointUrl: form.endpointUrl.trim(),
    credentialEnvName: form.credentialEnvName.trim() || null,
    timeoutSeconds: form.timeoutSeconds,
    enabled: editing.value?.enabled ?? true,
  };
  if (!data.providerCode || !data.modelCode || !data.endpointUrl) {
    ElMessage.warning('请填写供应方、模型代号和 HTTPS 服务端点');
    return;
  }

  saving.value = true;
  try {
    await (editing.value
      ? updateAiModel(editing.value.id, {
          ...data,
          revision: editing.value.revision,
        })
      : createAiModel(data));
    dialogVisible.value = false;
    ElMessage.success('模型配置已保存');
    await load();
  } catch {
    // Preserve entered values; the shared request interceptor displays validation errors.
  } finally {
    saving.value = false;
  }
}

async function changeStatus(row: AiModelConfig) {
  const enabled = !row.enabled;
  const action = enabled ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(
      enabled
        ? `确认启用 ${row.providerCode}/${row.modelCode}？`
        : `确认停用 ${row.providerCode}/${row.modelCode}？停用后新业务场景不应再选择此模型。`,
      `${action}模型`,
      { type: 'warning' },
    );
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await setAiModelEnabled(row.id, { enabled, revision: row.revision });
    ElMessage.success(`模型已${action}`);
    await load();
  } catch {
    // The shared request interceptor displays the service error.
  } finally {
    statusChangingId.value = undefined;
  }
}

async function remove(row: AiModelConfig) {
  if (row.enabled) {
    ElMessage.warning('请先停用模型，再删除配置');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定删除停用模型 ${row.providerCode}/${row.modelCode}？被场景引用的模型无法删除。`,
      '删除模型配置',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await removeAiModel(row.id, row.revision);
    ElMessage.success('模型配置已删除');
    await load();
  } catch {
    // Keep the current list and let the shared request interceptor show the conflict.
  }
}

async function openCredential(row: AiModelConfig) {
  try {
    credentialTarget.value = can('ai:model:query')
      ? await getAiModel(row.id)
      : row;
    credentialForm.mode = credentialTarget.value.credentialMode ?? 'ENV';
    credentialForm.apiKey = '';
    credentialForm.clearKey = false;
    credentialVisible.value = true;
  } catch {
    /* The shared interceptor displays the service error. */
  }
}
async function saveCredential() {
  if (
    !credentialTarget.value ||
    credentialSaving.value ||
    !can('ai:model:edit')
  )
    return;
  credentialSaving.value = true;
  try {
    credentialTarget.value = await saveAiModelCredential(
      credentialTarget.value.id,
      { ...credentialForm, revision: credentialTarget.value.revision },
    );
    credentialForm.apiKey = '';
    credentialForm.clearKey = false;
    credentialVisible.value = false;
    ElMessage.success('模型凭据已保存');
    await load();
  } catch {
    /* Keep input for correction or retry. */
  } finally {
    credentialSaving.value = false;
  }
}
async function runTest(row: AiModelConfig) {
  if (testingId.value !== undefined || !can('ai:model:test')) return;
  testingId.value = row.id;
  testResult.value = undefined;
  testVisible.value = true;
  try {
    testResult.value = await testAiModel(row.id);
  } catch {
    testVisible.value = false;
  } finally {
    testingId.value = undefined;
  }
}
onMounted(load);
</script>

<template>
  <Page title="AI模型配置" description="配置模型、凭据并测试 OpenRouter 连接。">
    <div class="space-y-4 p-4">
      <el-alert
        title="密钥不会回显，模型测试会向 OpenRouter 发送一条简短请求。"
        type="info"
        closable
        show-icon
      />
      <el-card>
        <template #header>
          <div class="flex items-center justify-between">
            <span>模型列表</span>
            <el-button
              v-if="can('ai:model:add')"
              type="primary"
              @click="openCreate"
            >
              新增模型
            </el-button>
          </div>
        </template>

        <el-form inline @submit.prevent="search">
          <el-form-item label="供应方">
            <el-input
              v-model="query.providerCode"
              clearable
              maxlength="64"
              placeholder="如 openai"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item label="模型代号">
            <el-input
              v-model="query.modelCode"
              clearable
              maxlength="128"
              placeholder="精确匹配"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select
              v-model="query.enabled"
              clearable
              placeholder="全部"
              class="w-32"
            >
              <el-option label="启用" value="true" />
              <el-option label="停用" value="false" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="search">查询</el-button>
            <el-button @click="resetSearch">重置</el-button>
            <el-button :loading="loading" @click="load">刷新</el-button>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="failed"
          class="mb-4"
          title="加载失败，请检查权限或服务状态后重试"
          type="error"
        >
          <template #default>
            <el-button link type="primary" @click="load">重新加载</el-button>
          </template>
        </el-alert>
        <el-empty
          v-if="!can('ai:model:list')"
          description="无模型配置查看权限"
        />
        <el-empty
          v-else-if="!loading && !failed && page.total === 0"
          description="暂无模型配置"
        />
        <el-table v-else v-loading="loading" :data="page.records" row-key="id">
          <el-table-column prop="providerCode" label="供应方" min-width="130" />
          <el-table-column prop="modelCode" label="模型代号" min-width="180" />
          <el-table-column
            prop="endpointUrl"
            label="服务端点"
            min-width="220"
            show-overflow-tooltip
          />
          <el-table-column label="凭据" min-width="160">
            <template #default="{ row }">
              {{
                row.credentialMode === 'DB'
                  ? '加密数据库'
                  : row.credentialEnvName || '环境变量'
              }}
              · {{ row.credentialConfigured ? '已配置' : '未配置' }}
            </template>
          </el-table-column>
          <el-table-column
            prop="timeoutSeconds"
            label="超时（秒）"
            width="110"
          />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="230" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="can('ai:model:query')"
                link
                type="primary"
                @click="showDetail(row)"
              >
                详情
              </el-button>
              <el-button
                v-if="can('ai:model:edit')"
                link
                type="primary"
                @click="openEdit(row)"
              >
                编辑
              </el-button>
              <el-button
                v-if="can('ai:model:edit')"
                link
                type="primary"
                @click="openCredential(row)"
              >
                凭据
              </el-button>
              <el-button
                v-if="can('ai:model:test')"
                link
                type="primary"
                :loading="testingId === row.id"
                :disabled="!row.enabled || testingId !== undefined"
                @click="runTest(row)"
              >
                测试模型
              </el-button>
              <el-button
                v-if="can('ai:model:edit')"
                link
                :type="row.enabled ? 'warning' : 'success'"
                :loading="statusChangingId === row.id"
                @click="changeStatus(row)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button
                v-if="can('ai:model:remove') && !row.enabled"
                link
                type="danger"
                @click="remove(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div
          v-if="can('ai:model:list') && Number(page.total) > 0"
          class="mt-4 flex justify-end"
        >
          <el-pagination
            :current-page="query.pageNum"
            :page-size="query.pageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="Number(page.total)"
            layout="total, sizes, prev, pager, next"
            @current-change="onPageChange"
            @size-change="onPageSizeChange"
          />
        </div>
      </el-card>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑模型配置' : '新增模型配置'"
      width="620px"
    >
      <el-alert
        class="mb-4"
        title="API Key 请通过列表中的“凭据”入口设置。"
        type="info"
        closable
      />
      <el-form :model="form" label-width="120px">
        <el-form-item label="供应方标识" required>
          <el-input
            v-model="form.providerCode"
            maxlength="64"
            placeholder="如 openai"
          />
        </el-form-item>
        <el-form-item label="模型代号" required>
          <el-input
            v-model="form.modelCode"
            maxlength="128"
            placeholder="如 gpt-4.1-mini"
          />
        </el-form-item>
        <el-form-item label="HTTPS 服务端点" required>
          <el-input
            v-model="form.endpointUrl"
            maxlength="2048"
            placeholder="https://api.example.com/v1"
          />
        </el-form-item>
        <el-form-item label="凭据环境变量名">
          <el-input
            v-model="form.credentialEnvName"
            maxlength="128"
            placeholder="大写下划线格式，如 OPENAI_API_KEY"
          />
        </el-form-item>
        <el-form-item label="超时（秒）" required>
          <el-input-number v-model="form.timeoutSeconds" :min="1" :max="300" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="模型配置详情" width="620px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="供应方">
          {{ detail.providerCode }}
        </el-descriptions-item>
        <el-descriptions-item label="模型代号">
          {{ detail.modelCode }}
        </el-descriptions-item>
        <el-descriptions-item label="服务端点">
          {{ detail.endpointUrl }}
        </el-descriptions-item>
        <el-descriptions-item label="凭据引用">
          {{ detail.credentialEnvName || '未配置' }}
        </el-descriptions-item>
        <el-descriptions-item label="超时">
          {{ detail.timeoutSeconds }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          {{ detail.enabled ? '启用' : '停用' }}
        </el-descriptions-item>
        <el-descriptions-item label="版本">
          {{ detail.revision }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ detail.createTime }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ detail.updateTime }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="credentialVisible"
      title="模型凭据"
      width="540px"
      :close-on-click-modal="!credentialSaving"
      :close-on-press-escape="!credentialSaving"
      :show-close="!credentialSaving"
      @closed="credentialForm.apiKey = ''"
    >
      <el-form
        label-width="120px"
        :disabled="credentialSaving"
        @submit.prevent="saveCredential"
      >
        <el-form-item label="密钥来源">
          <el-select v-model="credentialForm.mode">
            <el-option label="加密数据库" value="DB" />
            <el-option label="环境变量引用" value="ENV" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="credentialForm.mode === 'DB'" label="API Key">
          <el-input
            v-model="credentialForm.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="留空保持原密钥"
            :maxlength="8192"
          />
        </el-form-item>
        <el-form-item label="当前状态">
          {{ credentialTarget?.credentialConfigured ? '已配置' : '未配置' }}
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="credentialForm.clearKey">
            明确清除数据库密钥
          </el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button
          :disabled="credentialSaving"
          @click="credentialVisible = false"
        >
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="credentialSaving"
          @click="saveCredential"
        >
          保存凭据
        </el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="testVisible" title="模型测试结果" width="620px">
      <p v-if="testingId !== undefined" role="status">正在等待供应方响应…</p>
      <el-descriptions v-if="testResult" :column="1" border>
        <el-descriptions-item label="结果">
          {{ testResult.message }}（{{ testResult.outcome }}）
        </el-descriptions-item>
        <el-descriptions-item label="指定模型">
          {{ testResult.model }}
        </el-descriptions-item>
        <el-descriptions-item label="返回模型">
          {{ testResult.returnedModel || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="耗时">
          {{ testResult.elapsedMs }} ms
        </el-descriptions-item>
        <el-descriptions-item label="HTTP状态">
          {{ testResult.httpStatus || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="供应方请求ID">
          {{ testResult.providerId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="文本">
          <pre class="whitespace-pre-wrap">{{ testResult.content || '-' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </Page>
</template>
