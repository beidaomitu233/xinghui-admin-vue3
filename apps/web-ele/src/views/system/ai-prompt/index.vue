<script lang="ts" setup>
import type {
  PromptModelOption,
  PromptSceneDraft,
  PromptScenePage,
  PromptSceneSummary,
  PromptSceneView,
  PromptVariable,
  PromptVariableType,
} from '#/api/system/ai-prompt-scene';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  createPromptScene,
  getPromptScene,
  listPromptSceneModels,
  listPromptScenes,
  previewPromptScene,
  publishPromptScene,
  removePromptScene,
  setPromptSceneEnabled,
  updatePromptSceneDraft,
} from '#/api/system/ai-prompt-scene';

const accessStore = useAccessStore();
const can = (permission: string) =>
  accessStore.accessCodes.includes(permission);
const page = ref<PromptScenePage>({
  records: [],
  total: 0,
  pageNum: 1,
  pageSize: 10,
});
const models = ref<PromptModelOption[]>([]);
const loading = ref(false);
const failed = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const previewVisible = ref(false);
const detailVisible = ref(false);
const editing = ref<PromptSceneView>();
const detail = ref<PromptSceneView>();
const previewing = ref<PromptSceneView>();
const renderedPreview = ref('');
const previewLoading = ref(false);
const statusChangingId = ref<number>();
const form = reactive({
  appKey: '',
  sceneKey: '',
  modelId: 0,
  prompt: '',
  variables: [] as PromptVariable[],
  revision: 0,
});
const previewValues = reactive<Record<string, string>>({});
const query = reactive({
  appKey: '',
  sceneKey: '',
  enabled: '' as '' | 'false' | 'true',
  published: '' as '' | 'false' | 'true',
  pageNum: 1,
  pageSize: 10,
});

async function load() {
  if (!can('ai:prompt:list')) return;
  loading.value = true;
  failed.value = false;
  try {
    page.value = await listPromptScenes({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      ...(query.appKey.trim() ? { appKey: query.appKey.trim() } : {}),
      ...(query.sceneKey.trim() ? { sceneKey: query.sceneKey.trim() } : {}),
      ...(query.enabled ? { enabled: query.enabled === 'true' } : {}),
      ...(query.published ? { published: query.published === 'true' } : {}),
    });
  } catch {
    page.value = { ...page.value, records: [], total: 0 };
    failed.value = true;
    ElMessage.error('加载场景失败');
  } finally {
    loading.value = false;
  }
}

async function loadModels() {
  if (!can('ai:prompt:add') && !can('ai:prompt:edit')) return false;
  try {
    models.value = await listPromptSceneModels();
    return true;
  } catch {
    models.value = [];
    return false;
  }
}

function search() {
  query.pageNum = 1;
  void load();
}

function resetSearch() {
  query.appKey = '';
  query.sceneKey = '';
  query.enabled = '';
  query.published = '';
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

function newVariable(): PromptVariable {
  return {
    name: '',
    type: 'STRING',
    description: '',
    sensitive: false,
    exampleValue: '',
  };
}

async function openCreate() {
  if (!(await loadModels())) {
    ElMessage.error('加载可用模型失败');
    return;
  }
  if (models.value.length === 0) {
    ElMessage.warning('请先在 AI 模型配置中启用至少一个模型');
    return;
  }
  editing.value = undefined;
  Object.assign(form, {
    appKey: '',
    sceneKey: '',
    modelId: models.value[0]!.id,
    prompt: '',
    variables: [],
    revision: 0,
  });
  dialogVisible.value = true;
}

async function openEdit(row: PromptSceneSummary) {
  if (!(await loadModels())) {
    ElMessage.error('加载可用模型失败');
    return;
  }
  try {
    const latest = await getPromptScene(row.id);
    editing.value = latest;
    Object.assign(form, {
      appKey: latest.appKey,
      sceneKey: latest.sceneKey,
      modelId: latest.draftModelId,
      prompt: latest.draftPrompt,
      variables: latest.draftVariables.map((variable) => ({ ...variable })),
      revision: latest.revision,
    });
    dialogVisible.value = true;
  } catch {
    await load();
  }
}

function addVariable() {
  form.variables.push(newVariable());
}

function removeVariable(index: number) {
  form.variables.splice(index, 1);
}

function draftData(): PromptSceneDraft {
  return {
    modelId: Number(form.modelId),
    prompt: form.prompt,
    variables: form.variables.map((variable) => ({ ...variable })),
  };
}

function validForm() {
  if (!form.modelId || !form.prompt.trim()) {
    ElMessage.warning('请选择启用模型并填写提示词草稿');
    return false;
  }
  if (!editing.value && (!form.appKey.trim() || !form.sceneKey.trim())) {
    ElMessage.warning('请填写应用标识和场景标识');
    return false;
  }
  return true;
}

async function saveDraft() {
  if (!validForm()) return;
  saving.value = true;
  try {
    if (editing.value) {
      const updated = await updatePromptSceneDraft(editing.value.id, {
        ...draftData(),
        revision: editing.value.revision,
      });
      form.revision = updated.revision;
    } else {
      await createPromptScene({
        appKey: form.appKey.trim(),
        sceneKey: form.sceneKey.trim(),
        ...draftData(),
      });
    }
    dialogVisible.value = false;
    editing.value = undefined;
    ElMessage.success('场景草稿已保存');
    await load();
  } catch {
    ElMessage.warning(
      '草稿未保存；如记录已被其他管理员修改，请刷新后重新打开编辑',
    );
    await load();
  } finally {
    saving.value = false;
  }
}

async function showDetail(row: PromptSceneSummary) {
  try {
    detail.value = await getPromptScene(row.id);
    detailVisible.value = true;
  } catch {
    await load();
  }
}

async function openPreview(row: PromptSceneSummary) {
  try {
    const latest = await getPromptScene(row.id);
    previewing.value = latest;
    renderedPreview.value = '';
    for (const key of Object.keys(previewValues)) delete previewValues[key];
    for (const variable of latest.draftVariables) {
      previewValues[variable.name] = variable.exampleValue;
    }
    previewVisible.value = true;
  } catch {
    await load();
  }
}

async function runPreview() {
  if (!previewing.value) return;
  previewLoading.value = true;
  renderedPreview.value = '';
  try {
    const preview = await previewPromptScene(previewing.value.id, {
      revision: previewing.value.revision,
      values: { ...previewValues },
    });
    renderedPreview.value = preview.prompt;
  } catch {
    ElMessage.warning('预览失败；请检查占位符、变量值以及模型状态');
  } finally {
    previewLoading.value = false;
  }
}

async function publish(row: PromptSceneSummary) {
  try {
    await ElMessageBox.confirm(
      `发布 ${row.appKey}/${row.sceneKey} 的当前草稿？校验通过后，新快照才会替换已发布内容。`,
      '发布场景',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await publishPromptScene(row.id, row.revision);
    ElMessage.success('场景快照已发布');
    await load();
  } catch {
    ElMessage.warning('发布失败；请检查变量声明、模型状态或修订冲突');
    await load();
  }
}

async function changeEnabled(row: PromptSceneSummary) {
  const enabled = !row.enabled;
  try {
    await ElMessageBox.confirm(
      enabled
        ? `确认启用 ${row.appKey}/${row.sceneKey}？`
        : `确认停用 ${row.appKey}/${row.sceneKey}？停用后内部读取不会返回该场景。`,
      enabled ? '启用场景' : '停用场景',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await setPromptSceneEnabled(row.id, { enabled, revision: row.revision });
    ElMessage.success(`场景已${enabled ? '启用' : '停用'}`);
    await load();
  } catch {
    ElMessage.warning('状态修改失败；请刷新后重试');
    await load();
  } finally {
    statusChangingId.value = undefined;
  }
}

async function remove(row: PromptSceneSummary) {
  if (row.enabled) {
    ElMessage.warning('请先停用场景，再删除配置');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定删除停用场景 ${row.appKey}/${row.sceneKey}？草稿和已发布快照都会删除。`,
      '删除场景',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await removePromptScene(row.id, row.revision);
    ElMessage.success('场景已删除');
    await load();
  } catch {
    ElMessage.warning('删除失败；请刷新列表并确认场景仍处于停用状态');
    await load();
  }
}

function variableTypeLabel(type: PromptVariableType) {
  return { STRING: '文本', NUMBER: '数字', BOOLEAN: '布尔值' }[type];
}

onMounted(() => {
  void load();
  if (can('ai:prompt:add') || can('ai:prompt:edit')) void loadModels();
});
</script>

<template>
  <Page
    title="场景提示词"
    description="为独立应用登记场景，并管理草稿、变量声明与已发布快照"
  >
    <div class="space-y-4 p-4">
      <el-alert
        title="这里只管理提示词配置。草稿修改不会影响已发布快照；预览只用中性示例值或本页输入，不读取业务数据、不调用模型，也不显示模型凭据。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-card>
        <template #header>
          <div class="flex items-center justify-between">
            <span>应用场景</span>
            <el-button
              v-if="can('ai:prompt:add')"
              type="primary"
              @click="openCreate"
            >
              新增场景
            </el-button>
          </div>
        </template>
        <el-form inline @submit.prevent="search">
          <el-form-item label="应用标识">
            <el-input
              v-model="query.appKey"
              clearable
              maxlength="64"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item label="场景标识">
            <el-input
              v-model="query.sceneKey"
              clearable
              maxlength="96"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item label="场景状态">
            <el-select
              v-model="query.enabled"
              clearable
              placeholder="全部"
              class="w-28"
            >
              <el-option label="启用" value="true" />
              <el-option label="停用" value="false" />
            </el-select>
          </el-form-item>
          <el-form-item label="发布状态">
            <el-select
              v-model="query.published"
              clearable
              placeholder="全部"
              class="w-28"
            >
              <el-option label="已发布" value="true" />
              <el-option label="未发布" value="false" />
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
          v-if="!can('ai:prompt:list')"
          description="无场景列表查看权限"
        />
        <el-empty
          v-else-if="!loading && !failed && Number(page.total) === 0"
          description="暂无场景，可为不同应用分别登记场景"
        />
        <el-table v-else v-loading="loading" :data="page.records" row-key="id">
          <el-table-column prop="appKey" label="应用标识" min-width="140" />
          <el-table-column prop="sceneKey" label="场景标识" min-width="150" />
          <el-table-column label="草稿模型 / 修订" min-width="190">
            <template #default="{ row }">
              <div>
                {{ row.draftProviderCode }}/{{ row.draftModelCode }} · r{{
                  row.draftRevision
                }}
              </div>
              <el-tag v-if="!row.draftModelEnabled" type="danger" size="small">
                草稿模型已停用
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="已发布快照" min-width="205">
            <template #default="{ row }">
              <div v-if="row.published">
                {{ row.publishedProviderCode }}/{{ row.publishedModelCode }} ·
                r{{ row.publishedRevision }}
              </div>
              <span v-else>未发布</span>
              <el-tag
                v-if="row.published && !row.publishedModelEnabled"
                type="danger"
                size="small"
              >
                已发布模型已停用
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="启停状态" width="95">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="330" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="can('ai:prompt:query')"
                link
                type="primary"
                @click="showDetail(row)"
              >
                详情
              </el-button>
              <el-button
                v-if="can('ai:prompt:query')"
                link
                type="primary"
                @click="openPreview(row)"
              >
                预览
              </el-button>
              <el-button
                v-if="can('ai:prompt:query') && can('ai:prompt:edit')"
                link
                type="primary"
                @click="openEdit(row)"
              >
                编辑草稿
              </el-button>
              <el-button
                v-if="can('ai:prompt:publish')"
                link
                type="primary"
                :disabled="!row.draftModelEnabled"
                @click="publish(row)"
              >
                发布
              </el-button>
              <el-button
                v-if="can('ai:prompt:enable')"
                link
                :type="row.enabled ? 'warning' : 'success'"
                :loading="statusChangingId === row.id"
                @click="changeEnabled(row)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button
                v-if="can('ai:prompt:remove') && !row.enabled"
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
          v-if="can('ai:prompt:list') && Number(page.total) > 0"
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
      :title="editing ? '编辑场景草稿' : '新增场景草稿'"
      width="860px"
      destroy-on-close
    >
      <el-alert
        class="mb-4"
        title="保存只更新草稿；已发布快照保持不变。变量使用 {{variableName}} 占位符，发布前服务端会检查声明和类型。示例值须为中性测试值。"
        type="info"
        :closable="false"
      />
      <el-form label-width="130px">
        <el-form-item label="应用标识" required>
          <el-input
            v-model="form.appKey"
            :disabled="Boolean(editing)"
            maxlength="64"
            placeholder="例如 sample_alpha"
          />
        </el-form-item>
        <el-form-item label="场景标识" required>
          <el-input
            v-model="form.sceneKey"
            :disabled="Boolean(editing)"
            maxlength="96"
            placeholder="例如 summarize_record"
          />
        </el-form-item>
        <el-form-item label="启用模型" required>
          <el-select
            v-model="form.modelId"
            class="w-full"
            placeholder="选择当前已启用的模型"
          >
            <el-option
              v-for="model in models"
              :key="model.id"
              :label="`${model.providerCode}/${model.modelCode}`"
              :value="model.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="提示词草稿" required>
          <el-input
            v-model="form.prompt"
            type="textarea"
            :rows="8"
            maxlength="12000"
            show-word-limit
            placeholder="只写静态提示词与已声明变量占位符；不插入业务数据"
          />
        </el-form-item>
        <el-form-item label="变量声明">
          <div class="w-full space-y-3">
            <el-empty
              v-if="form.variables.length === 0"
              description="当前场景无变量"
              :image-size="48"
            />
            <div
              v-for="(variable, index) in form.variables"
              :key="`${variable.name}-${index}`"
              class="rounded border p-3"
            >
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <el-input
                  v-model="variable.name"
                  maxlength="64"
                  placeholder="变量名，例如 recordName"
                />
                <el-select v-model="variable.type" placeholder="变量类型">
                  <el-option label="文本" value="STRING" />
                  <el-option label="数字" value="NUMBER" />
                  <el-option label="布尔值" value="BOOLEAN" />
                </el-select>
                <el-input
                  v-model="variable.description"
                  maxlength="160"
                  placeholder="变量用途说明"
                />
                <el-input
                  v-model="variable.exampleValue"
                  :type="variable.sensitive ? 'password' : 'text'"
                  maxlength="512"
                  :show-password="variable.sensitive"
                  placeholder="中性示例值；不要填入真实业务数据"
                />
              </div>
              <div class="mt-2 flex items-center justify-between">
                <el-switch
                  v-model="variable.sensitive"
                  active-text="敏感示例，输入时隐藏"
                />
                <el-button link type="danger" @click="removeVariable(index)">
                  移除变量
                </el-button>
              </div>
            </div>
            <el-button @click="addVariable">添加变量声明</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDraft">
          保存草稿
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewVisible"
      title="场景中性预览"
      width="760px"
      destroy-on-close
    >
      <el-alert
        title="预览只在本地配置值与中性示例值间做占位符替换，不调用 AI 模型、不读取业务数据；敏感变量在预览文本中会被掩码。"
        type="info"
        :closable="false"
      />
      <el-form v-if="previewing" label-width="125px" class="mt-4">
        <el-form-item
          v-for="variable in previewing.draftVariables"
          :key="variable.name"
          :label="variable.name"
        >
          <el-input
            v-model="previewValues[variable.name]"
            :type="variable.sensitive ? 'password' : 'text'"
            :show-password="variable.sensitive"
            :placeholder="variableTypeLabel(variable.type)"
          />
          <div class="ml-2 text-xs text-gray-500">
            {{ variable.description }}
          </div>
        </el-form-item>
      </el-form>
      <div v-if="renderedPreview" class="mt-4 rounded border p-4">
        <div class="mb-2 font-medium">替换后的预览文本</div>
        <pre class="whitespace-pre-wrap break-words">{{ renderedPreview }}</pre>
      </div>
      <template #footer>
        <el-button @click="previewVisible = false">关闭</el-button>
        <el-button type="primary" :loading="previewLoading" @click="runPreview">
          生成中性预览
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="场景草稿与发布快照" width="760px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="应用 / 场景">
          {{ detail.appKey }} / {{ detail.sceneKey }}
        </el-descriptions-item>
        <el-descriptions-item label="草稿模型">
          {{ detail.draftProviderCode }}/{{ detail.draftModelCode }}
          <span v-if="!detail.draftModelEnabled">（模型已停用）</span>
        </el-descriptions-item>
        <el-descriptions-item label="草稿修订">
          {{ detail.draftRevision }} · 配置版本 {{ detail.revision }}
        </el-descriptions-item>
        <el-descriptions-item label="草稿正文">
          <pre class="whitespace-pre-wrap break-words">{{
            detail.draftPrompt
          }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="草稿变量">
          {{
            detail.draftVariables
              .map(
                (variable) =>
                  `${variable.name}（${variableTypeLabel(variable.type)}）`,
              )
              .join('、') || '无'
          }}
        </el-descriptions-item>
        <el-descriptions-item label="已发布快照">
          <template v-if="detail.published">
            {{ detail.publishedProviderCode }}/{{ detail.publishedModelCode }} ·
            r{{ detail.publishedRevision }}
            <span v-if="!detail.publishedModelEnabled">
              （模型已停用，内部读取会拒绝）
            </span>
            <pre class="mt-2 whitespace-pre-wrap break-words">{{
              detail.publishedPrompt
            }}</pre>
          </template>
          <span v-else>尚未发布</span>
        </el-descriptions-item>
        <el-descriptions-item label="场景状态">
          {{ detail.enabled ? '启用' : '停用' }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </Page>
</template>
