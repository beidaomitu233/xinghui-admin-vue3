<script setup lang="ts">
import type { ModelReference } from '#/api/system/ai-application';
import type {
  AuthorizedSchema,
  DatasetOption,
  QueryBinding,
  QueryContext,
  QueryInput,
  QueryResult,
  SqlQuery,
} from '#/api/system/ai-query';
import type {
  SqlAssistanceStart,
  SqlAssistanceView,
} from '#/api/system/ai-sql-assistance';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';

import {
  getQueryCatalog,
  getQuerySchema,
  previewQuery,
  queryIssueMessage,
  validateQuery,
} from '#/api/system/ai-query';
import { aiErrorMessage, aiFailureInfo } from '#/api/system/ai-runtime-errors';
import {
  cancelSqlAssistance,
  getSqlAssistance,
  startSqlAssistance,
} from '#/api/system/ai-sql-assistance';

import { variableToken } from './prompt-tokens';
import { queryParameterText, readQueryParameters } from './query-parameters';

const props = defineProps<{
  binding?: QueryBinding;
  configured: boolean;
  initialModel?: ModelReference | null;
  open: boolean;
  readonly: boolean;
  revision: number;
  saveBinding: (binding: QueryBinding) => Promise<boolean>;
  sceneKey: string;
  sceneSaving?: boolean;
  usedVariables: string[];
}>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const access = useAccessStore();
const identity = computed(() =>
  JSON.stringify([access.accessToken, access.accessCodes]),
);
const schema = ref<AuthorizedSchema>();
const schemaLoading = ref(false);
const description = ref('');
const selectedDatasets = ref<string[]>([]);
const catalog = ref<DatasetOption[]>([]);
const catalogLabels = ref<Record<string, DatasetOption>>({});
const catalogPage = ref(1);
const catalogTotal = ref('0');
const catalogSearch = ref('');
const catalogLoading = ref(false);
const catalogOptions = computed(() => {
  const options = catalog.value.map((option) => ({
    datasetKey: option.datasetKey,
    label: option.label,
  }));
  for (const key of selectedDatasets.value)
    if (!options.some((option) => option.datasetKey === key))
      options.push({
        datasetKey: key,
        label: catalogLabels.value[key]?.label ?? '已选来源（说明未读到）',
      });
  return options;
});
const nextCatalogPage = computed(
  () =>
    /^\d+$/.test(catalogTotal.value) &&
    BigInt(catalogPage.value * 20) < BigInt(catalogTotal.value),
);
const sql = ref('');
const parameterText = ref('{}');
const parameterUnsafe = ref(false);
const maxRows = ref(20);
const label = ref('');
const variable = ref('query_data');
const panels = ref<string[]>([]);
const result = ref<QueryResult>();
const receipt = ref('');
const error = ref('');
const notice = ref('');
const busy = ref(false);
const saving = ref(false);
const generationBusy = ref(false);
const generationUnknown = ref(false);
const generationView = ref<SqlAssistanceView>();
const candidate = ref<SqlQuery>();
let pendingStart: SqlAssistanceStart | undefined;
let acceptedId = '';
let generatedAgainst = '';
let baseline = '';
let generation = 0;
let schemaGeneration = 0;
let previewGeneration = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
let resetting = false;
let requestIdentity = '';
let catalogGeneration = 0;
let catalogTimer: ReturnType<typeof setTimeout> | undefined;
const context = computed<QueryContext>(() => ({
  datasetKeys: [...selectedDatasets.value],
  businessRef: null,
}));
const fingerprint = computed(() =>
  JSON.stringify([
    context.value,
    sql.value,
    parameterText.value,
    maxRows.value,
  ]),
);
const draft = computed(() =>
  JSON.stringify([
    description.value,
    selectedDatasets.value,
    sql.value,
    parameterText.value,
    maxRows.value,
    label.value,
    variable.value,
  ]),
);
const generating = computed(
  () =>
    generationBusy.value ||
    Boolean(
      generationView.value &&
      ['QUEUED', 'RUNNING', 'VALIDATING'].includes(generationView.value.status),
    ),
);
const scopeReady = computed(() => Boolean(schema.value?.datasets.length));
const canPreview = computed(
  () =>
    !props.readonly &&
    scopeReady.value &&
    Boolean(sql.value.trim()) &&
    !busy.value &&
    !saving.value &&
    !generating.value,
);
const canSave = computed(
  () =>
    !props.readonly &&
    !saving.value &&
    !busy.value &&
    !parameterUnsafe.value &&
    scopeReady.value &&
    Boolean(sql.value.trim() && label.value.trim()),
);
const statuses = {
  QUEUED: '等待生成',
  RUNNING: '正在生成 SQL',
  VALIDATING: '正在校验 SQL',
  SUCCEEDED: '生成完成，待只读试查',
  FAILED: '生成未完成，可手工编写 SQL',
  CANCELLED: '已取消生成',
  TIMED_OUT: '生成超时，可手工编写 SQL',
  INCOMPLETE: '生成不完整，可手工编写 SQL',
};
function statusOf(failure: unknown) {
  return (failure as null | { response?: { status?: number } })?.response
    ?.status;
}
function clearPolling() {
  clearTimeout(pollTimer);
  pollTimer = undefined;
}
function nextVariable() {
  let number = 1;
  let name = 'query_data';
  while (props.usedVariables.includes(name)) name = `query_data_${++number}`;
  return name;
}
function makeQuery(): SqlQuery {
  if (parameterUnsafe.value) throw new Error('Unsafe server parameters');
  const parameters = readQueryParameters(parameterText.value);
  if (
    parameters === null ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters) ||
    Object.keys(parameters).length > 32
  )
    throw new Error('parameters');
  const reserved = new Set(
    (schema.value?.trustedParameters ?? []).map((name) =>
      name.replace(/^:/, ''),
    ),
  );
  if (Object.keys(parameters).some((name) => reserved.has(name)))
    throw new Error('parameters');
  return {
    sql: sql.value,
    parameters,
    maxRows: maxRows.value,
  };
}
async function readSchema() {
  const run = ++schemaGeneration;
  schema.value = undefined;
  receipt.value = '';
  result.value = undefined;
  if (!props.open || props.readonly) return;
  schemaLoading.value = true;
  try {
    const value = await getQuerySchema(context.value);
    if (alive && props.open && run === schemaGeneration) {
      schema.value = value;
      for (const dataset of value.datasets)
        catalogLabels.value[dataset.datasetKey] = dataset;
    }
  } catch (error_) {
    if (alive && run === schemaGeneration) {
      const code = aiFailureInfo(error_).code;
      if (code === 'AI_QUERY_RESULT_LIMIT')
        error.value = '可查询来源较多，请用查询范围选择最多 16 项。';
      else
        error.value = code
          ? aiErrorMessage(code)
          : '可查询范围未读到，请缩小范围后重试。';
    }
  } finally {
    if (alive && run === schemaGeneration) schemaLoading.value = false;
  }
}
async function readCatalog(page = 1) {
  const run = ++catalogGeneration;
  if (!props.open || props.readonly) return;
  catalogLoading.value = true;
  try {
    const value = await getQueryCatalog({
      keyword: catalogSearch.value || undefined,
      pageNum: page,
      pageSize: 20,
    });
    if (!alive || !props.open || run !== catalogGeneration) return;
    catalog.value = value.records;
    catalogPage.value = value.pageNum;
    catalogTotal.value = value.total;
    for (const option of value.records)
      catalogLabels.value[option.datasetKey] = option;
    if (Object.keys(catalogLabels.value).length > 512)
      catalogLabels.value = Object.fromEntries(
        [
          ...value.records,
          ...selectedDatasets.value.flatMap((key) =>
            catalogLabels.value[key] ? [catalogLabels.value[key]] : [],
          ),
        ].map((option) => [option.datasetKey, option]),
      );
  } catch {
    if (alive && run === catalogGeneration)
      error.value = '查询范围候选未读到，请重试。';
  } finally {
    if (alive && run === catalogGeneration) catalogLoading.value = false;
  }
}
function searchCatalog(keyword: string) {
  catalogSearch.value = keyword.slice(0, 100);
  catalogGeneration++;
  clearTimeout(catalogTimer);
  catalogTimer = setTimeout(() => void readCatalog(1), 300);
}
function reset() {
  resetting = true;
  generation++;
  schemaGeneration++;
  previewGeneration++;
  clearPolling();
  pendingStart = undefined;
  acceptedId = '';
  candidate.value = undefined;
  catalogGeneration++;
  clearTimeout(catalogTimer);
  catalog.value = [];
  catalogLabels.value = {};
  catalogPage.value = 1;
  catalogTotal.value = '0';
  catalogSearch.value = '';
  catalogLoading.value = false;
  generationView.value = undefined;
  const binding = props.binding;
  description.value = binding?.description ?? '';
  selectedDatasets.value = [...(binding?.datasetKeys ?? [])];
  sql.value = binding?.query.sql ?? '';
  parameterUnsafe.value = false;
  try {
    parameterText.value = queryParameterText(binding?.query.parameters ?? {});
  } catch {
    parameterText.value = '{}';
    parameterUnsafe.value = true;
  }
  maxRows.value = binding?.query.maxRows ?? 20;
  label.value = binding?.label ?? '';
  variable.value = binding?.variable ?? nextVariable();
  schema.value = undefined;
  schemaLoading.value = false;
  result.value = undefined;
  receipt.value = '';
  error.value = parameterUnsafe.value
    ? '已有参数未使用精确数值编码，请重新填写后保存。'
    : '';
  notice.value = '';
  busy.value = false;
  saving.value = false;
  generationBusy.value = false;
  generationUnknown.value = false;
  panels.value = binding ? ['sql'] : [];
  baseline = draft.value;
  void nextTick(() => {
    resetting = false;
  });
}
function hasUnsaved() {
  return (
    props.open &&
    (draft.value !== baseline || generating.value || generationUnknown.value)
  );
}
async function canLeave() {
  if (!props.open) return true;
  if (saving.value) return false;
  const run = generation;
  if (hasUnsaved()) {
    try {
      await ElMessageBox.confirm(
        '查询引用尚有未保存内容，确认关闭？正在进行的生成会提交取消请求。',
        '关闭前确认',
        {
          confirmButtonText: '关闭',
          cancelButtonText: '继续编辑',
          type: 'warning',
        },
      );
    } catch {
      return false;
    }
  }
  return alive && run === generation;
}
function discard() {
  if (acceptedId && generating.value && requestIdentity === identity.value)
    void cancelSqlAssistance(acceptedId).catch(() => {});
  reset();
  emit('update:open', false);
}
async function close(done?: () => void) {
  if (!(await canLeave())) return;
  discard();
  done?.();
}
defineExpose({ canLeave, discard, hasUnsaved });
function useCandidate() {
  if (!candidate.value || props.readonly) return;
  let parameters: string;
  try {
    parameters = queryParameterText(candidate.value.parameters);
  } catch {
    error.value = '生成结果未保留精确数值，请重新生成或手工填写参数。';
    candidate.value = undefined;
    return;
  }
  sql.value = candidate.value.sql;
  parameterText.value = parameters;
  parameterUnsafe.value = false;
  maxRows.value = candidate.value.maxRows;
  panels.value = [...new Set(['sql', ...panels.value])];
  candidate.value = undefined;
}
async function poll(id = acceptedId, run = generation) {
  clearPolling();
  if (!id || !alive || run !== generation) return;
  try {
    const value = await getSqlAssistance(id);
    if (!alive || !props.open || run !== generation || id !== acceptedId)
      return;
    generationView.value = value;
    if (['QUEUED', 'RUNNING', 'VALIDATING'].includes(value.status)) {
      if (!value.deadline || Date.now() < Date.parse(value.deadline))
        pollTimer = setTimeout(() => void poll(id, run), 1200);
      else error.value = '已到生成期限，请查询原状态；也可手工编写 SQL。';
    } else if (value.status === 'SUCCEEDED') {
      if (
        !value.query ||
        value.schemaFingerprint !== schema.value?.fingerprint
      ) {
        error.value = '生成结果的范围已变化，请重新读取范围。';
        return;
      }
      candidate.value = value.query;
      if (fingerprint.value === generatedAgainst) useCandidate();
    } else
      error.value =
        value.diagnostics.length > 0
          ? queryIssueMessage(value.diagnostics[0]?.code ?? '')
          : statuses[value.status];
  } catch {
    if (alive && run === generation)
      error.value = '生成状态未读到，请查询原状态；不会重新调用模型。';
  }
}
async function generateSql() {
  if (
    props.readonly ||
    generationBusy.value ||
    generating.value ||
    !schema.value ||
    !description.value.trim() ||
    props.sceneSaving ||
    (!props.configured && !props.initialModel)
  )
    return;
  const retrying = Boolean(pendingStart);
  pendingStart ??= {
    sceneKey: props.sceneKey,
    expectedSceneRevision: props.revision,
    description: description.value,
    ...context.value,
    initialModel: props.configured ? null : (props.initialModel ?? null),
    expectedSchemaFingerprint: schema.value.fingerprint,
    confirmedCosts: true,
    clientMutationId: crypto.randomUUID(),
    maxRows: maxRows.value,
  };
  const attempt = pendingStart;
  const run = generation;
  const actor = identity.value;
  requestIdentity = actor;
  if (!retrying) generatedAgainst = fingerprint.value;
  generationBusy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const accepted = await startSqlAssistance(attempt);
    if (!alive || !props.open || run !== generation) {
      if (identity.value === actor)
        void cancelSqlAssistance(accepted.requestId).catch(() => {});
      return;
    }
    if (acceptedId && accepted.requestId !== acceptedId)
      throw new Error('Unconfirmed admission');
    acceptedId = accepted.requestId;
    pendingStart = undefined;
    generationUnknown.value = false;
    await poll(acceptedId, run);
  } catch (error_) {
    if (!alive || run !== generation) return;
    const status = statusOf(error_);
    generationUnknown.value = !status || status >= 500;
    if (!generationUnknown.value) pendingStart = undefined;
    if (generationUnknown.value)
      error.value = '生成受理未确认，可重试原请求；仍可手工编辑 SQL。';
    else if (status === 409)
      error.value = '场景或数据范围已变化，请重新读取后生成。';
    else error.value = '未能生成 SQL，请检查当前权限或手工编写。';
  } finally {
    if (alive && run === generation) generationBusy.value = false;
  }
}
async function cancelGeneration() {
  if (!acceptedId || props.readonly) return;
  const run = generation;
  clearPolling();
  try {
    await cancelSqlAssistance(acceptedId);
    if (alive && run === generation) await poll(acceptedId, run);
  } catch {
    if (alive && run === generation)
      error.value = '取消尚未确认，请查询原状态。';
  }
}
async function preview() {
  if (!canPreview.value) return;
  let input: QueryInput;
  try {
    input = { ...context.value, query: makeQuery() };
  } catch {
    error.value = '业务参数须为有效 JSON 对象，且不能填写服务端保留参数。';
    return;
  }
  const submitted = fingerprint.value;
  const run = ++previewGeneration;
  busy.value = true;
  error.value = '';
  notice.value = '';
  result.value = undefined;
  receipt.value = '';
  try {
    const validation = await validateQuery(input);
    if (
      !alive ||
      !props.open ||
      run !== previewGeneration ||
      submitted !== fingerprint.value
    )
      return;
    if (!validation.valid) {
      error.value = queryIssueMessage(
        validation.diagnostics[0]?.code ?? 'INVALID_SQL',
      );
      return;
    }
    if (validation.currentRecordDatasetKey) {
      notice.value =
        '动态记录查询已通过静态校验，尚未取数；可先保存，运行时由业务记录提供上下文。';
      return;
    }
    const value = await previewQuery(input);
    if (
      !alive ||
      !props.open ||
      run !== previewGeneration ||
      submitted !== fingerprint.value
    )
      return;
    result.value = value;
    receipt.value = submitted;
    notice.value = `已返回 ${value.rowCount} 行${value.truncated ? '，结果已截断' : ''}。`;
  } catch (error_) {
    if (alive && run === previewGeneration) {
      const code = aiFailureInfo(error_).code;
      if (code) error.value = aiErrorMessage(code);
      else if (statusOf(error_) === 409)
        error.value = '数据定义已变化，请重新读取范围。';
      else if (statusOf(error_) === 504)
        error.value = '只读试查已超时，请缩小范围。';
      else error.value = '只读试查未完成，请检查语句、参数与当前权限。';
    }
  } finally {
    if (alive && run === previewGeneration) busy.value = false;
  }
}
async function save() {
  if (!canSave.value) return;
  if (
    !/^[A-Z_]\w{0,63}$/i.test(variable.value) ||
    variable.value === 'user_request' ||
    (!props.binding && props.usedVariables.includes(variable.value))
  ) {
    error.value = '注入标识重复或格式不正确。';
    return;
  }
  const run = generation;
  saving.value = true;
  error.value = '';
  try {
    const binding: QueryBinding = {
      variable: variable.value,
      label: label.value.trim(),
      description: description.value,
      datasetKeys: [...selectedDatasets.value],
      query: makeQuery(),
    };
    const submitted = fingerprint.value;
    const validation = await validateQuery({
      ...context.value,
      query: binding.query,
    });
    if (!alive || run !== generation || submitted !== fingerprint.value) return;
    if (!validation.valid) {
      error.value = queryIssueMessage(
        validation.diagnostics[0]?.code ?? 'INVALID_SQL',
      );
      return;
    }
    const saved = await props.saveBinding(binding);
    if (!alive || run !== generation) return;
    if (!saved) {
      error.value = '引用保存尚未确认，内容已保留；请检查场景保存状态后重试。';
      return;
    }
    if (acceptedId && generating.value)
      void cancelSqlAssistance(acceptedId).catch(() => {});
    baseline = draft.value;
    emit('update:open', false);
    reset();
  } catch {
    if (alive && run === generation)
      error.value = '引用未保存，当前输入已保留。';
  } finally {
    if (alive && run === generation) saving.value = false;
  }
}
function cell(value: unknown) {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
watch(fingerprint, () => {
  previewGeneration++;
  result.value = undefined;
  receipt.value = '';
  busy.value = false;
  notice.value = '';
});
watch(parameterText, () => {
  if (!resetting) parameterUnsafe.value = false;
});
watch(
  () => JSON.stringify(selectedDatasets.value),
  () => {
    if (props.open && !resetting) void readSchema();
  },
);
watch(
  () => props.open,
  async (open) => {
    if (open) {
      reset();
      await nextTick();
      if (props.open) void readSchema();
      if (props.open) void readCatalog(1);
    } else reset();
  },
  { immediate: true },
);
watch(identity, () => {
  if (props.open) emit('update:open', false);
  reset();
});
onBeforeUnmount(() => {
  if (acceptedId && generating.value && requestIdentity === identity.value)
    void cancelSqlAssistance(acceptedId).catch(() => {});
  alive = false;
  generation++;
  schemaGeneration++;
  previewGeneration++;
  clearPolling();
  catalogGeneration++;
  clearTimeout(catalogTimer);
  pendingStart = undefined;
  result.value = undefined;
  schema.value = undefined;
});
</script>
<template>
  <ElDrawer
    :model-value="open"
    :title="binding ? '编辑查询引用' : '添加数据引用'"
    size="min(800px, 100vw)"
    :close-on-click-modal="false"
    :before-close="close"
  >
    <ElForm label-position="top" class="sql-assistant-form">
      <p class="query-scope" aria-label="当前可查询范围">
        {{
          schemaLoading
            ? '正在读取可查询范围…'
            : schema?.scopeDescription || '当前可查询范围尚未读取'
        }}
      </p>
      <ElFormItem label="查询范围（可选）">
        <ElSelect
          v-model="selectedDatasets"
          aria-label="缩小查询数据范围"
          multiple
          filterable
          remote
          :remote-method="searchCatalog"
          :multiple-limit="16"
          collapse-tags
          collapse-tags-tooltip
          :loading="catalogLoading"
          :disabled="generating || generationUnknown || saving || readonly"
          placeholder="搜索并选择数据来源，最多 16 项"
        >
          <ElOption
            v-for="dataset in catalogOptions"
            :key="dataset.datasetKey"
            :value="dataset.datasetKey"
            :label="dataset.label"
          />
          <template #footer>
            <div class="catalog-pages">
              <ElButton
                link
                :disabled="catalogLoading || catalogPage <= 1"
                @click.stop="readCatalog(catalogPage - 1)"
              >
                上一页
              </ElButton>
              <span>第 {{ catalogPage }} 页 · {{ catalogTotal }} 项</span>
              <ElButton
                link
                :disabled="catalogLoading || !nextCatalogPage"
                @click.stop="readCatalog(catalogPage + 1)"
              >
                下一页
              </ElButton>
            </div>
          </template>
        </ElSelect>
      </ElFormItem>
      <ElCollapse v-model="panels">
        <ElCollapseItem title="查看可查询的数据与字段" name="scope">
          <div class="schema-list">
            <div
              v-for="dataset in schema?.datasets ?? []"
              :key="dataset.datasetKey"
            >
              <strong>{{ dataset.label }}</strong>
              <code class="schema-sql-name">{{ dataset.sqlName }}</code>
              <p>{{ dataset.description }} · {{ dataset.scopeDescription }}</p>
              <span
                v-for="column in dataset.columns"
                :key="column.name"
                class="schema-field"
              >
                {{ column.label }} ({{ column.name }})
              </span>
            </div>
          </div>
          <ElButton
            link
            :disabled="schemaLoading || generating"
            @click="readSchema"
          >
            重新读取范围
          </ElButton>
        </ElCollapseItem>
      </ElCollapse>
      <ElFormItem label="描述要取的数据">
        <ElInput
          v-model="description"
          type="textarea"
          :rows="3"
          aria-label="描述要取的数据"
          maxlength="2000"
          :disabled="readonly || generating || generationUnknown || saving"
          placeholder="例如：按客户汇总本月可读订单的金额"
        />
      </ElFormItem>
      <div class="generation-actions">
        <ElButton
          type="primary"
          title="调用当前场景模型生成 SQL，可能产生费用"
          :disabled="
            readonly ||
            !scopeReady ||
            !description.trim() ||
            sceneSaving ||
            (!configured && !initialModel) ||
            generating
          "
          :loading="generationBusy"
          @click="generateSql"
        >
          {{ generationUnknown ? '重试原生成请求' : '生成 SQL' }}
        </ElButton>
        <ElButton v-if="acceptedId" :disabled="generationBusy" @click="poll()">
          查询原状态
        </ElButton>
        <ElButton v-if="generating && acceptedId" @click="cancelGeneration">
          取消生成
        </ElButton>
        <ElButton v-if="candidate" @click="useCandidate">
          使用生成的 SQL
        </ElButton>
        <ElButton link @click="panels = [...new Set([...panels, 'sql'])]">
          手工编写 SQL
        </ElButton>
      </div>
      <p v-if="generationView" class="query-hint" role="status">
        {{ statuses[generationView.status] }}
      </p>
      <ElCollapse v-model="panels">
        <ElCollapseItem title="查看或修订 SQL" name="sql">
          <ElFormItem label="只读 SQL">
            <ElInput
              v-model="sql"
              type="textarea"
              :rows="6"
              maxlength="16000"
              aria-label="只读 SQL"
              :readonly="readonly || generating || saving"
            />
          </ElFormItem>
          <ElFormItem label="最多返回行数">
            <ElInputNumber
              v-model="maxRows"
              :min="1"
              :max="200"
              :disabled="readonly || busy || generating || saving"
              aria-label="试查行数上限"
            />
          </ElFormItem>
          <ElCollapse>
            <ElCollapseItem title="高级：业务参数" name="parameters">
              <ElFormItem label="业务参数 JSON">
                <ElInput
                  v-model="parameterText"
                  type="textarea"
                  :rows="2"
                  aria-label="SQL 业务参数"
                  :readonly="readonly || generating || saving"
                />
              </ElFormItem>
              <p class="query-hint">
                当前用户、租户和业务记录参数由服务端绑定。
              </p>
            </ElCollapseItem>
          </ElCollapse>
        </ElCollapseItem>
      </ElCollapse>
      <div>
        <ElButton :disabled="!canPreview" :loading="busy" @click="preview">
          只读试查
        </ElButton>
      </div>
      <ElAlert
        v-if="error || notice"
        :title="error || notice"
        :type="error ? 'warning' : 'success'"
        closable
        @close="
          error = '';
          notice = '';
        "
      />
      <ElTable
        v-if="result && receipt === fingerprint"
        :data="result.rows"
        max-height="240"
        size="small"
        empty-text="本次查询没有匹配记录"
      >
        <ElTableColumn
          v-for="column in result.columns"
          :key="column.name"
          :label="column.label || column.name"
          min-width="120"
        >
          <template #default="{ row }">
            {{
              cell(
                Object.hasOwn(row, column.name) ? row[column.name] : undefined,
              )
            }}
          </template>
        </ElTableColumn>
      </ElTable>
      <ElFormItem label="引用名称">
        <ElInput
          v-model="label"
          aria-label="查询引用名称"
          maxlength="100"
          :readonly="readonly || saving"
          placeholder="例如：客户订单汇总"
        />
      </ElFormItem>
      <p class="query-hint">
        注入标识
        <code>{{ variableToken({ name: variable, label }) }}</code>
      </p>
      <p v-if="!result" class="query-hint">
        保存只校验引用定义，不代表已取数；动态记录上下文由实际业务运行提供。
      </p>
    </ElForm>
    <template #footer>
      <ElButton @click="close()">关闭</ElButton>
      <ElButton
        type="primary"
        :disabled="!canSave"
        :loading="saving"
        @click="save"
      >
        保存并插入提示词
      </ElButton>
    </template>
  </ElDrawer>
</template>
<style scoped>
.sql-assistant-form {
  display: grid;
  gap: 14px;
}

.query-scope {
  font-size: 13px;
  line-height: 1.6;
  color: hsl(var(--foreground));
}

.query-hint {
  font-size: 12px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
}

.query-hint code {
  color: hsl(var(--primary));
}

.generation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.catalog-pages {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.generation-actions :deep(.el-button) {
  margin-left: 0;
}

.query-options {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
}

.schema-list {
  display: grid;
  gap: 14px;
  max-height: 180px;
  overflow: auto;
  font-size: 12px;
}

.schema-list p {
  color: hsl(var(--muted-foreground));
}

.schema-sql-name {
  margin-left: 8px;
  color: hsl(var(--muted-foreground));
}

.schema-field {
  display: inline-block;
  margin: 6px 12px 0 0;
}

@media (max-width: 600px) {
  .query-options {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
