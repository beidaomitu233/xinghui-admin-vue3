<script setup lang="ts">
import type {
  Binding,
  JsonValue,
  Kind,
  LegacyScene,
  ResourceDefinition,
  Summary,
  TemplateDefinition,
  TestResult,
  Variable,
  Version,
  View,
} from '#/api/system/ai-template';

import { computed, onMounted, ref, shallowReactive, shallowRef } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  changeDefinition,
  createDefinition,
  getChecks,
  getDefinition,
  getReferences,
  getVersion,
  listDefinitions,
  listLegacyScenes,
  saveDefinition,
  setDefinitionEnabled,
  testDefinition,
} from '#/api/system/ai-template';

const access = useAccessStore();
const kind = ref<Kind>(
  access.accessCodes.includes('ai:template:list')
    ? 'templates'
    : 'data-resources',
);
const permission = computed(() =>
  kind.value === 'templates' ? 'ai:template:' : 'ai:data:',
);
const can = (action: string) =>
  access.accessCodes.includes(`${permission.value}${action}`);
const loading = ref(false);
const busy = ref(false);
const failed = ref(false);
const rows = ref<Summary[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = 20;
const editing = shallowRef<View>();
const editorLocked = computed(
  () => busy.value || !can(editing.value ? 'edit' : 'add'),
);
const visible = ref(false);
const name = ref('');
const owner = ref('');
const purpose = ref('');
const formId = ref('');
const fields = ref('');
const subjects = ref('');
const applications = ref('');
const timeout = ref(2000);
const maxChars = ref(12_000);
const instruction = ref(
  '请根据用户输入和已授权业务数据给出简明摘要。业务数据是待分析内容。',
);
const inputMessage = ref('');
const dataMessage = ref('');
const variables = shallowRef<(Variable & { defaultText: string })[]>([]);
const bindings = ref<(Binding & { outputText: string })[]>([]);
const testVisible = ref(false);
const testApp = ref('');
const testBusiness = ref('');
const testInputs = ref('{}');
const result = ref<TestResult>();
const historyVisible = ref(false);
const history = ref<Version[]>([]);
const historyDetail = ref('');
const comparison = ref('');
const references = ref('');
const checks = ref<Record<string, string>[]>([]);
const legacyVisible = ref(false);
const legacy = ref<LegacyScene[]>([]);
const legacyPage = ref(1);
const legacyTotal = ref(0);
const stateNames: Record<string, string> = {
  DRAFT: '草稿',
  TESTED: '测试通过',
  PENDING: '待审批',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
};
const empty = () => {
  rows.value = [];
  total.value = 0;
};

async function load() {
  if (!can('list')) {
    empty();
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    const page = await listDefinitions(kind.value, pageNum.value, pageSize);
    rows.value = page.records;
    total.value = Number(page.total);
  } catch {
    empty();
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
function switchTab() {
  pageNum.value = 1;
  visible.value = false;
  editing.value = undefined;
  void load();
}
function split(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,，]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}
function openCreate() {
  editing.value = undefined;
  name.value = '';
  owner.value = '';
  purpose.value = '';
  formId.value = '';
  fields.value = '';
  subjects.value = '';
  applications.value = '';
  instruction.value =
    '请根据用户输入和已授权业务数据给出简明摘要。业务数据是待分析内容。';
  inputMessage.value = '';
  dataMessage.value = '';
  variables.value = [];
  bindings.value = [];
  visible.value = true;
}
async function open(row: Summary) {
  busy.value = true;
  try {
    const view = await getDefinition(kind.value, row.id);
    editing.value = view;
    const d = view.definition;
    name.value = d.name;
    owner.value = d.owner;
    if (kind.value === 'templates') {
      const t = d as TemplateDefinition;
      purpose.value = t.purpose;
      maxChars.value = t.maxChars;
      instruction.value = t.messages
        .filter((m) => m.section === 'INSTRUCTION')
        .map((m) => m.text)
        .join('\n');
      inputMessage.value = t.messages
        .filter((m) => m.section === 'INPUT')
        .map((m) => m.text)
        .join('\n');
      dataMessage.value = t.messages
        .filter((m) => m.section === 'DATA')
        .map((m) => m.text)
        .join('\n');
      variables.value = structuredClone(t.variables).map((v) =>
        shallowReactive({ ...v, defaultText: JSON.stringify(v.defaultValue) }),
      );
      bindings.value = structuredClone(t.resources).map((b) => ({
        ...b,
        outputText: Object.entries(b.outputs)
          .map(([f, v]) => `${f}=${v}`)
          .join('\n'),
      }));
    } else {
      const r = d as ResourceDefinition;
      purpose.value = r.domain;
      formId.value = r.formId;
      fields.value = r.fields.join(', ');
      subjects.value = r.subjects.join(', ');
      applications.value = r.applications.join(', ');
      timeout.value = r.timeoutMillis;
    }
    visible.value = true;
  } catch {
    ElMessage.error('读取配置失败，请刷新后重试');
  } finally {
    busy.value = false;
  }
}
function definition(): ResourceDefinition | TemplateDefinition {
  if (kind.value === 'data-resources')
    return {
      name: name.value.trim(),
      owner: owner.value.trim(),
      domain: purpose.value.trim(),
      source: 'lowcode.record',
      formId: formId.value.trim(),
      fields: split(fields.value),
      subjects: split(subjects.value),
      applications: split(applications.value),
      timeoutMillis: timeout.value,
    };
  return {
    name: name.value.trim(),
    owner: owner.value.trim(),
    purpose: purpose.value.trim(),
    maxChars: maxChars.value,
    messages: [
      { section: 'INSTRUCTION', text: instruction.value },
      { section: 'INPUT', text: inputMessage.value },
      { section: 'DATA', text: dataMessage.value },
    ].filter((m) => m.text.trim()) as TemplateDefinition['messages'],
    variables: variables.value.map(({ defaultText, ...v }) => ({
      ...v,
      defaultValue: v.hasDefault
        ? (JSON.parse(defaultText || 'null') as JsonValue)
        : null,
    })),
    resources: bindings.value.map(({ outputText, ...b }) => ({
      ...b,
      outputs: Object.fromEntries(
        outputText
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('=');
            if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim())
              throw new Error('字段映射格式应为 字段=变量');
            return [parts[0].trim(), parts[1].trim()];
          }),
      ),
    })),
  };
}
async function save() {
  busy.value = true;
  try {
    let d: ResourceDefinition | TemplateDefinition;
    try {
      d = definition();
    } catch {
      ElMessage.error('请检查默认值JSON与字段映射格式');
      return;
    }
    if (!d.name || !d.owner) {
      ElMessage.warning('请填写名称和负责人');
      return;
    }
    if (editing.value)
      editing.value = await saveDefinition(
        kind.value,
        editing.value.id,
        editing.value.revision,
        d,
      );
    else await createDefinition(kind.value, d);
    visible.value = false;
    ElMessage.success('草稿已保存');
    await load();
  } catch {
    ElMessage.error('保存失败，草稿输入已保留');
  } finally {
    busy.value = false;
  }
}
async function action(
  row: Summary,
  action: 'approval' | 'publish' | 'submit',
  approved?: boolean,
) {
  const confirmationMessage = {
    approval: approved
      ? '批准当前配置并生成不可变资源版本？'
      : '拒绝当前资源配置？',
    publish: '发布当前模板？已绑定应用保持原版本，须由应用显式升级。',
    submit: '提交当前已测试配置审批？',
  }[action];
  if (!(await confirm(confirmationMessage))) return;
  busy.value = true;
  try {
    await changeDefinition(kind.value, row.id, action, row.revision, approved);
    ElMessage.success('操作成功');
    await load();
  } catch {
    ElMessage.error('操作失败，请刷新配置后重试');
  } finally {
    busy.value = false;
  }
}
async function toggle(row: Summary) {
  busy.value = true;
  try {
    const detail = await getDefinition(kind.value, row.id);
    const groups = await Promise.all(
      detail.versions.map((v) => getReferences(kind.value, row.id, v.id)),
    );
    const impacted = [...new Set(groups.flat().map((r) => r.name))];
    if (
      !(await confirm(
        row.enabled
          ? `停用后将阻止后续请求。当前引用应用：${impacted.join('、') || '暂无'}。确认继续？`
          : '重新启用已发布版本？',
      ))
    )
      return;
    await setDefinitionEnabled(kind.value, row.id, row.revision, !row.enabled);
    await load();
  } catch {
    ElMessage.error('无法完成启停或核对引用，请刷新后重试');
  } finally {
    busy.value = false;
  }
}
async function confirm(message: string) {
  try {
    await ElMessageBox.confirm(message, '确认操作');
    return true;
  } catch {
    return false;
  }
}
async function openTest(row: Summary) {
  busy.value = true;
  try {
    editing.value = await getDefinition(kind.value, row.id);
    result.value = undefined;
    testVisible.value = true;
  } catch {
    ElMessage.error('读取测试配置失败，请刷新后重试');
  } finally {
    busy.value = false;
  }
}
async function test(preview: boolean) {
  if (!editing.value) return;
  let inputs: Record<string, JsonValue>;
  try {
    const parsed: unknown = JSON.parse(testInputs.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('测试输入须为JSON对象');
    inputs = parsed as Record<string, JsonValue>;
  } catch {
    ElMessage.warning('测试输入须为JSON对象');
    return;
  }
  busy.value = true;
  result.value = undefined;
  try {
    result.value = await testDefinition(
      kind.value,
      editing.value.id,
      {
        revision: editing.value.revision,
        appId: testApp.value.trim(),
        businessRef: testBusiness.value.trim(),
        inputs,
      },
      preview,
    );
    editing.value = await getDefinition(kind.value, editing.value.id);
    await load();
  } catch {
    ElMessage.error('预览或测试失败，请核对权限、版本和输入');
  } finally {
    busy.value = false;
  }
}
async function openHistory(row: Summary) {
  busy.value = true;
  try {
    editing.value = await getDefinition(kind.value, row.id);
    history.value = editing.value.versions;
    historyDetail.value = '';
    comparison.value = '';
    references.value = '';
    checks.value = [];
    if (kind.value === 'data-resources') checks.value = await getChecks(row.id);
    historyVisible.value = true;
  } catch {
    ElMessage.error('读取版本或审批证据失败，请重试');
  } finally {
    busy.value = false;
  }
}
async function inspect(version: Version, compare = false) {
  if (!editing.value) return;
  busy.value = true;
  try {
    const exact = await getVersion(kind.value, editing.value.id, version.id);
    const text = JSON.stringify(exact.definition, null, 2);
    if (compare) comparison.value = text;
    else historyDetail.value = text;
  } catch {
    ElMessage.error('读取精确版本失败，请重试');
  } finally {
    busy.value = false;
  }
}
async function inspectReferences(version: Version) {
  if (!editing.value) return;
  busy.value = true;
  references.value = '';
  try {
    const refs = await getReferences(kind.value, editing.value.id, version.id);
    references.value =
      refs.length > 0
        ? refs
            .map((r) => `${r.name}（应用 ${r.appId}，版本 ${r.appVersionId}）`)
            .join('\n')
        : '此版本暂无应用引用';
  } catch {
    ElMessage.error('引用服务不可用，不能判断为无引用');
  } finally {
    busy.value = false;
  }
}
async function loadLegacy() {
  busy.value = true;
  try {
    const page = await listLegacyScenes(legacyPage.value);
    legacy.value = page.records;
    legacyTotal.value = Number(page.total);
    legacyVisible.value = true;
  } catch {
    ElMessage.error('读取兼容映射失败，请重试');
  } finally {
    busy.value = false;
  }
}
function addVariable() {
  variables.value = [
    ...variables.value,
    shallowReactive({
      name: '',
      type: 'STRING',
      required: true,
      hasDefault: false,
      defaultValue: null,
      maxChars: 2000,
      sensitive: false,
      truncate: false,
      defaultText: '',
    }),
  ];
}
function addBinding() {
  bindings.value.push({
    name: '',
    resourceId: '',
    resourceVersionId: '',
    required: true,
    omitOnMissing: false,
    parameters: {
      formId: { source: 'BUSINESS_REF', key: 'formId' },
      recordId: { source: 'BUSINESS_REF', key: 'recordId' },
    },
    outputs: {},
    outputText: '',
  });
}
onMounted(load);
</script>

<template>
  <section class="min-w-0">
    <el-tabs v-model="kind" @tab-change="switchTab">
      <el-tab-pane
        v-if="access.accessCodes.includes('ai:template:list')"
        :disabled="busy || loading"
        label="模板"
        name="templates"
      />
      <el-tab-pane
        v-if="access.accessCodes.includes('ai:data:list')"
        :disabled="busy || loading"
        label="数据引用"
        name="data-resources"
      />
    </el-tabs>
    <div class="mb-4 flex gap-3">
      <el-button
        v-if="can('add')"
        :disabled="busy || loading"
        type="primary"
        @click="openCreate"
      >
        新增{{ kind === 'templates' ? '模板' : '数据引用' }}
      </el-button>
      <el-button :disabled="busy" :loading="loading" @click="load">
        刷新
      </el-button>
      <el-button
        v-if="kind === 'templates' && can('query')"
        :disabled="busy || loading"
        @click="loadLegacy"
      >
        旧场景兼容映射
      </el-button>
    </div>
    <el-alert
      v-if="failed"
      title="加载失败，请重试"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="id"
      empty-text="暂无配置"
    >
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column prop="id" label="ID" min-width="170" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">
            {{ row.enabled ? '已启用' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        v-if="kind === 'data-resources'"
        label="审批状态"
        width="110"
      >
        <template #default="{ row }">
          {{ stateNames[row.state] || row.state }}
        </template>
      </el-table-column>
      <el-table-column prop="revision" label="修订" width="70" />
      <el-table-column prop="update_time" label="更新时间" min-width="160" />
      <el-table-column label="操作" min-width="380">
        <template #default="{ row }">
          <el-button
            v-if="can('query')"
            :disabled="busy"
            link
            @click="open(row)"
          >
            查看 / 编辑
          </el-button>
          <el-button
            v-if="can('test') || (kind === 'templates' && can('preview'))"
            :disabled="busy"
            link
            @click="openTest(row)"
          >
            测试 / 预览
          </el-button>
          <el-button
            v-if="can('query')"
            :disabled="busy"
            link
            @click="openHistory(row)"
          >
            版本与引用
          </el-button>
          <el-button
            v-if="kind === 'templates' && can('publish')"
            link
            type="primary"
            :disabled="busy"
            @click="action(row, 'publish')"
          >
            发布
          </el-button>
          <el-button
            v-if="kind === 'data-resources' && can('submit')"
            link
            :disabled="busy || row.state !== 'TESTED'"
            @click="action(row, 'submit')"
          >
            提交审批
          </el-button>
          <el-button
            v-if="
              kind === 'data-resources' &&
              can('approve') &&
              row.state === 'PENDING'
            "
            link
            type="success"
            :disabled="busy"
            @click="action(row, 'approval', true)"
          >
            批准
          </el-button>
          <el-button
            v-if="
              kind === 'data-resources' &&
              can('approve') &&
              row.state === 'PENDING'
            "
            link
            type="danger"
            :disabled="busy"
            @click="action(row, 'approval', false)"
          >
            拒绝
          </el-button>
          <el-button
            v-if="can('disable')"
            link
            :disabled="busy"
            @click="toggle(row)"
          >
            {{ row.enabled ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="pageNum"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      class="mt-4"
      @current-change="load"
    />

    <el-dialog
      v-model="visible"
      :title="`${editing ? '配置草稿' : '新增配置'} · ${kind === 'templates' ? '模板' : '数据引用'}`"
      width="min(1100px, 95vw)"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form label-width="110px" :disabled="editorLocked">
        <div class="grid gap-3 md:grid-cols-2">
          <el-form-item label="名称" required>
            <el-input v-model="name" maxlength="100" />
          </el-form-item>
          <el-form-item label="负责人" required>
            <el-input v-model="owner" maxlength="100" />
          </el-form-item>
        </div>
        <el-form-item
          :label="kind === 'templates' ? '用途' : '业务域'"
          required
        >
          <el-input v-model="purpose" maxlength="500" />
        </el-form-item>
        <template v-if="kind === 'templates'">
          <el-form-item label="系统指令">
            <el-input
              v-model="instruction"
              type="textarea"
              :rows="3"
              maxlength="12000"
              placeholder="固定指令，不接受变量占位符"
            />
          </el-form-item>
          <el-form-item label="用户输入">
            <el-input
              v-model="inputMessage"
              type="textarea"
              :rows="3"
              maxlength="12000"
              placeholder="使用 {{变量名}} 引用输入变量"
            />
          </el-form-item>
          <el-form-item label="业务数据">
            <el-input
              v-model="dataMessage"
              type="textarea"
              :rows="3"
              maxlength="12000"
              placeholder="使用 {{变量名}} 引用获批资源变量"
            />
          </el-form-item>
          <el-form-item label="消息总字数">
            <el-input-number v-model="maxChars" :min="256" :max="32000" />
          </el-form-item>
          <h3 class="mb-2 font-medium">变量</h3>
          <div
            v-for="(variable, index) in variables"
            :key="index"
            class="mb-3 rounded border p-3"
          >
            <div class="flex flex-wrap gap-2">
              <el-input
                v-model="variable.name"
                placeholder="变量名"
                style="width: 160px"
              />
              <el-select v-model="variable.type" style="width: 120px">
                <el-option
                  v-for="type in [
                    'STRING',
                    'NUMBER',
                    'BOOLEAN',
                    'OBJECT',
                    'ARRAY',
                  ]"
                  :key="type"
                  :value="type"
                  :label="type"
                />
              </el-select>
              <el-input-number
                v-model="variable.maxChars"
                :min="1"
                :max="8000"
              />
              <el-checkbox v-model="variable.required">必填</el-checkbox>
              <el-checkbox v-model="variable.sensitive">敏感</el-checkbox>
              <el-checkbox v-model="variable.truncate">
                允许截断文本
              </el-checkbox>
              <el-checkbox v-model="variable.hasDefault">
                显式默认值
              </el-checkbox>
              <el-button
                link
                type="danger"
                @click="variables = variables.filter((_, i) => i !== index)"
              >
                移除
              </el-button>
            </div>
            <el-input
              v-if="variable.hasDefault"
              v-model="variable.defaultText"
              class="mt-2"
              placeholder='JSON默认值，例如 "文本"、12、true'
            />
          </div>
          <el-button @click="addVariable">添加变量</el-button>
          <h3 class="mb-2 mt-5 font-medium">固定资源版本与字段映射</h3>
          <div
            v-for="(binding, index) in bindings"
            :key="index"
            class="mb-3 rounded border p-3"
          >
            <div class="flex flex-wrap gap-2">
              <el-input
                v-model="binding.name"
                placeholder="引用名"
                style="width: 140px"
              />
              <el-input
                v-model="binding.resourceId"
                placeholder="资源ID"
                style="width: 180px"
              />
              <el-input
                v-model="binding.resourceVersionId"
                placeholder="批准版本ID"
                style="width: 180px"
              />
              <el-checkbox
                v-model="binding.required"
                @change="binding.omitOnMissing = false"
              >
                必需
              </el-checkbox>
              <el-checkbox
                v-model="binding.omitOnMissing"
                :disabled="editorLocked || binding.required"
              >
                允许缺记录/空数据时省略
              </el-checkbox>
              <el-button link type="danger" @click="bindings.splice(index, 1)">
                移除
              </el-button>
            </div>
            <p class="my-2 text-sm text-gray-500">
              参数来自本次业务引用的 formId、recordId，服务端重新授权。
            </p>
            <el-input
              v-model="binding.outputText"
              type="textarea"
              :rows="2"
              placeholder="每行一个 批准字段=变量名"
            />
          </div>
          <el-button @click="addBinding">添加数据引用</el-button>
        </template>
        <template v-else>
          <el-form-item label="来源">
            <el-input model-value="低代码表单记录（只读）" disabled />
          </el-form-item>
          <el-form-item label="表单ID" required>
            <el-input v-model="formId" placeholder="精确十进制ID" />
          </el-form-item>
          <el-form-item label="批准字段" required>
            <el-input v-model="fields" placeholder="字段标识，以逗号分隔" />
          </el-form-item>
          <el-form-item label="允许主体ID" required>
            <el-input
              v-model="subjects"
              placeholder="用户ID，以逗号分隔；仍需业务读取权限"
            />
          </el-form-item>
          <el-form-item label="允许应用ID" required>
            <el-input v-model="applications" placeholder="应用ID，以逗号分隔" />
          </el-form-item>
          <el-form-item label="读取时限(ms)">
            <el-input-number v-model="timeout" :min="100" :max="5000" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">关闭</el-button>
        <el-button
          v-if="can(editing ? 'edit' : 'add')"
          type="primary"
          :loading="busy"
          @click="save"
        >
          保存草稿
        </el-button>
      </template>
    </el-dialog>
    <el-dialog
      v-model="legacyVisible"
      title="旧场景兼容映射"
      width="min(1000px, 95vw)"
    >
      <el-alert
        title="旧appKey/sceneKey继续使用原读取链路。当前publishedRevision只表示旧表快照，不是独立模板版本，也不自动迁入应用。"
        :closable="false"
        class="mb-3"
      />
      <el-table :data="legacy">
        <el-table-column prop="scene_id" label="旧场景ID" min-width="170" />
        <el-table-column prop="app_key" label="应用标识" />
        <el-table-column prop="scene_key" label="场景标识" />
        <el-table-column
          prop="published_model_id"
          label="原发布模型ID"
          min-width="170"
        />
        <el-table-column
          prop="published_revision"
          label="当前快照修订"
          width="120"
        />
      </el-table>
      <el-pagination
        v-model:current-page="legacyPage"
        :page-size="20"
        :total="legacyTotal"
        layout="total, prev, pager, next"
        class="mt-3"
        @current-change="loadLegacy"
      />
    </el-dialog>

    <el-dialog
      v-model="testVisible"
      title="当前身份测试"
      width="min(900px, 95vw)"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form label-width="115px">
        <el-form-item label="应用ID" required>
          <el-input v-model="testApp" />
        </el-form-item>
        <el-form-item label="业务引用" required>
          <el-input v-model="testBusiness" placeholder="formId:recordId" />
        </el-form-item>
        <el-form-item v-if="kind === 'templates'" label="变量输入JSON">
          <el-input v-model="testInputs" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <el-alert
        title="使用当前真实登录身份，资源值全部脱敏；配置管理权限不会授予业务读取权限。"
        :closable="false"
      />
      <div class="my-4 flex gap-2">
        <el-button
          v-if="kind === 'templates' && can('preview')"
          :loading="busy"
          @click="test(true)"
        >
          预览
        </el-button>
        <el-button
          v-if="can('test')"
          type="primary"
          :loading="busy"
          @click="test(false)"
        >
          执行准入测试
        </el-button>
      </div>
      <template v-if="result">
        <el-tag :type="result.outcome === 'SUCCESS' ? 'success' : 'danger'">
          {{ result.outcome }}
        </el-tag>
        <p v-if="kind === 'data-resources'" class="my-3">
          记录结构版本 {{ result.schemaVersion ?? '—' }} · 已授权字段：{{
            result.fields.join('、') || '无'
          }}
        </p>
        <el-collapse v-if="result.preview">
          <el-collapse-item
            v-if="result.details"
            title="模板原文"
            name="original"
          >
            <pre class="whitespace-pre-wrap break-all">{{
              JSON.stringify(result.details.original, null, 2)
            }}</pre>
          </el-collapse-item>
          <el-collapse-item
            v-if="result.details"
            title="输入（脱敏）"
            name="inputs"
          >
            <pre>{{ JSON.stringify(result.details.inputs, null, 2) }}</pre>
          </el-collapse-item>
          <el-collapse-item
            v-if="result.details"
            title="引用字段（脱敏）"
            name="resources"
          >
            <pre>{{ JSON.stringify(result.details.resources, null, 2) }}</pre>
          </el-collapse-item>
          <el-collapse-item title="最终消息（脱敏）" name="messages">
            <div
              v-for="(message, index) in result.preview.messages"
              :key="index"
              class="mb-3"
            >
              <strong>{{ message.section }}</strong>
              <pre
                class="whitespace-pre-wrap break-all rounded bg-gray-100 p-3 dark:bg-gray-800"
                v-text="message.text"
              ></pre>
            </div>
          </el-collapse-item>
          <el-collapse-item title="缺省与截断元数据" name="notices">
            <pre>{{ JSON.stringify(result.preview.notices, null, 2) }}</pre>
          </el-collapse-item>
        </el-collapse>
      </template>
    </el-dialog>

    <el-dialog
      v-model="historyVisible"
      title="不可变版本、比较与应用引用"
      width="min(1100px, 95vw)"
      destroy-on-close
    >
      <el-alert
        title="新发布版本不会自动升级应用的固定绑定。旧场景仍在原“场景提示词”页面读取，不伪造历史版本。"
        :closable="false"
        class="mb-3"
      />
      <el-table :data="history" empty-text="尚无发布版本">
        <el-table-column prop="version_no" label="版本" width="70" />
        <el-table-column prop="id" label="精确版本ID" min-width="170" />
        <el-table-column prop="create_time" label="发布时间" min-width="160" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button link @click="inspect(row)">查看</el-button>
            <el-button link @click="inspect(row, true)">对比</el-button>
            <el-button link @click="inspectReferences(row)">引用</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="references" class="my-3 whitespace-pre-wrap">{{ references }}</p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <pre
          v-if="historyDetail"
          class="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800"
          v-text="historyDetail"
        ></pre>
        <pre
          v-if="comparison"
          class="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800"
          v-text="comparison"
        ></pre>
      </div>
      <el-collapse v-if="checks.length > 0" class="mt-4">
        <el-collapse-item title="测试与审批证据">
          <el-table :data="checks">
            <el-table-column prop="action" label="动作" />
            <el-table-column prop="outcome" label="结果" />
            <el-table-column prop="subject_id" label="操作者" />
            <el-table-column prop="create_time" label="时间" />
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </el-dialog>
  </section>
</template>
