<script setup lang="ts">
import type { SaveView } from './ordered-autosave';

import type { BindingPreview } from '#/api/system/ai-database';
import type {
  SceneCreate,
  SceneDefinition,
  SceneDetail,
  SceneLegacy,
  SceneModelOption,
  SceneSubmission,
  SceneSummary,
} from '#/api/system/ai-scene';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDialog,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElPopconfirm,
  ElRadioButton,
  ElRadioGroup,
} from 'element-plus';

import {
  createScene,
  getScene,
  getSceneWorkspace,
  previewScene,
  sceneModels,
  setSceneEnabled,
} from '#/api/system/ai-scene';

import DatabaseBindingEditor from './DatabaseBindingEditor.vue';
import { OrderedSceneAutosave } from './ordered-autosave';
import PromptEditor from './PromptEditor.vue';
import { cloneScene, persistScene } from './scene-save-adapter';
import SceneDataSelector from './SceneDataSelector.vue';
import SceneFormPicker from './SceneFormPicker.vue';
import SceneSaveStatus from './SceneSaveStatus.vue';
import SceneSidebar from './SceneSidebar.vue';
import SceneTrialPanel from './SceneTrialPanel.vue';

const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:scene:${action}`);
const search = ref('');
const scenes = ref<SceneSummary[]>([]);
const listPage = ref(1);
const listTotal = ref('0');
const models = ref<SceneModelOption[]>([]);
const loading = ref(false);
const switching = ref(false);
const message = ref('');
const view = ref<SaveView<SceneDefinition>>();
const selected = ref<SceneSummary>();
const createOpen = ref(false);
const newName = ref('');
const newPurpose = ref('');
const newKind = ref<'GENERAL' | 'RECORD_SUMMARY'>('GENERAL');
const newFormId = ref('');
const creating = ref(false);
const pendingCreate = ref<SceneCreate>();
const toggling = ref(false);
const conflict = ref<SceneDetail>();
const legacy = ref<null | SceneLegacy>(null);
const legacyReasonLabels: Record<string, string> = {
  CUSTOM_INPUT_VARIABLE: '原配置含自定义输入变量，暂不支持转换。',
  EDITOR_LENGTH_EXCEEDED: '合并后的提示词过长，暂不能转换。',
  INPUT_LENGTH_POLICY_CHANGED: '输入长度限制与新格式不一致。',
  INPUT_REQUIRED_POLICY_CHANGED: '必填输入规则与新格式不一致。',
  MULTIPLE_RESOURCES: '原配置引用了多个数据对象，暂不支持转换。',
  RESOURCE_FIELDS_NOT_APPROVED: '引用字段未通过原资源审批。',
  RESOURCE_SCHEMA_UNAVAILABLE: '无法读取原数据对象的字段定义。',
  RESOURCE_SCOPE_DENIED: '原资源授权范围与当前场景或账号不匹配。',
  RESOURCE_UNAVAILABLE: '原数据资源暂不可用。',
  RESOURCE_VARIABLE_LENGTH_POLICY_CHANGED: '数据字段的长度限制与新格式不一致。',
  RESOURCE_VARIABLE_TYPE_POLICY_CHANGED: '数据字段的类型规则与新格式不一致。',
  SPECIAL_RESOURCE_MAPPING: '原数据引用含特殊映射，暂不支持转换。',
  SPECIAL_VARIABLE_SCHEMA: '原输入变量含特殊类型或默认值，暂不支持转换。',
  TEMPLATE_DISABLED: '原提示词模板已停用。',
  UNSUPPORTED_RESOURCE_FIELDS: '原数据来源或字段暂不支持转换。',
  VARIABLE_TRUNCATION_UNSUPPORTED: '原变量使用了截断规则，暂不支持转换。',
};
const legacyConversionLabels: Record<string, string> = {
  MESSAGE_SECTIONS_COMBINED_AS_USER: '原消息分区将合并为用户消息。',
  NULLS_PRESERVED_BY_BUILTIN_READER: '读取业务数据时保留原有空值。',
};
function legacyReasonLabel(code: string) {
  return Object.hasOwn(legacyReasonLabels, code)
    ? legacyReasonLabels[code]
    : '存在未说明的兼容性信息，请查看原内容。';
}
function legacyConversionLabel(code: string) {
  return Object.hasOwn(legacyConversionLabels, code)
    ? legacyConversionLabels[code]
    : '另有一项转换说明暂未提供详情，请查看原内容。';
}
const converted = ref(false);
const legacyByScene = new Map<string, null | SceneLegacy>();
const conversionConsent = new Set<string>();
const mutationConsent = new Map<string, boolean>();
const variables = ref<{ label: string; name: string }[]>([]);
const promptEditor = ref<InstanceType<typeof PromptEditor>>();
const trialBusinessRef = ref<null | { id: string; type: string }>(null);
const allVariables = computed(() => [
  ...(variables.value.some((variable) => variable.name === 'user_request')
    ? []
    : [{ label: '用户要求', name: 'user_request' }]),
  ...variables.value,
  ...(view.value?.value.dataBindings ?? []).map((binding) => ({
    label: binding.label,
    name: binding.variable,
  })),
]);
async function insertBinding(variable: string) {
  await nextTick();
  await promptEditor.value?.insertVariable(variable);
}
async function preparePreview() {
  if (!view.value) throw new Error('SCENE_UNAVAILABLE');
  const key = view.value.sceneKey;
  if (!(await autosave.flush(key))) throw new Error('SAVE_UNCONFIRMED');
  return autosave.view(key).confirmed.dataBindings ?? [];
}
async function readDataPreview(
  businessRef: SceneSubmission['businessRef'],
): Promise<BindingPreview> {
  if (!view.value) throw new Error('SCENE_UNAVAILABLE');
  const saved = autosave.view(view.value.sceneKey);
  const result = await previewScene(saved.sceneKey, {
    expectedRevision: saved.revision,
    businessRef,
    inputs: { user_request: '' },
  });
  if (!result.dataValues || !result.reads)
    throw new Error('PREVIEW_UNAVAILABLE');
  return {
    values: result.dataValues,
    reads: result.reads,
    notices: result.notices.map((code) => ({ code, reference: '' })),
  };
}
const leaveState = ref<'blocked' | 'saving' | null>(null);
let finishLeave: ((allowed: boolean) => void) | undefined;
let leaveGeneration = 0;
let loadGeneration = 0;
let detailGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const latestSummaries = new Map<string, SceneSummary>();
const dialogOpen = computed(() =>
  Boolean(leaveState.value || conflict.value || createOpen.value),
);
const dialogTitle = computed(() => {
  if (leaveState.value) return '离开前处理未确认内容';
  if (conflict.value) return '处理版本冲突';
  return '新建场景';
});
function closeWorkspaceDialog(done: () => void) {
  if (creating.value || leaveState.value) return;
  createOpen.value = false;
  conflict.value = undefined;
  done();
}
async function saveNow() {
  if (view.value && !(await autosave.flush(view.value.sceneKey)))
    message.value = '保存未完成，请检查当前字段或重试。';
}
async function prepareTrial() {
  return view.value ? autosave.flush(view.value.sceneKey) : false;
}
async function refreshModels() {
  if (!can('query')) return;
  try {
    const result = await sceneModels('TEXT');
    if (!disposed) models.value = result;
  } catch {
    if (!disposed) message.value = '模型组合读取失败，请重试。';
  }
}
const autosave = new OrderedSceneAutosave<SceneDefinition>({
  clone: cloneScene,
  equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  mutationId: () => crypto.randomUUID(),
  persist: (command) => {
    if (!mutationConsent.has(command.clientMutationId))
      mutationConsent.set(
        command.clientMutationId,
        conversionConsent.has(command.sceneKey),
      );
    return persistScene(
      command,
      (result) => {
        updateSummary(result.detail.scene);
        legacyByScene.set(command.sceneKey, result.detail.legacy ?? null);
        if (!result.detail.legacy) conversionConsent.delete(command.sceneKey);
        if (selected.value?.sceneKey === command.sceneKey)
          legacy.value = result.detail.legacy ?? null;
      },
      mutationConsent.get(command.clientMutationId),
    );
  },
  validate: (value) => {
    const errors: Record<string, string> = {};
    if (!value.name.trim()) errors.name = '请输入场景名称';
    if (!value.promptText.trim()) errors.promptText = '请输入提示词';
    if (value.modelPolicy.models.length === 0)
      errors.modelPolicy = '请选择模型';
    return errors;
  },
});
const unsubscribe = autosave.subscribe(() => {
  const key = autosave.activeKey();
  if (key) view.value = autosave.view(key);
});
const editable = computed(() => can('edit'));
const editorAllowed = (key: string) =>
  editable.value &&
  legacyByScene.get(key)?.compatibility !== 'READ_ONLY' &&
  (!legacyByScene.get(key)?.requiresConfirmation || conversionConsent.has(key));
watch(editable, (value) => {
  if (view.value)
    autosave.setEditable(
      view.value.sceneKey,
      value && editorAllowed(view.value.sceneKey),
    );
});
function updateSummary(summary: SceneSummary) {
  if (disposed) return;
  const existing = latestSummaries.get(summary.sceneKey);
  if (existing && existing.revision > summary.revision) return;
  latestSummaries.set(summary.sceneKey, summary);
  const index = scenes.value.findIndex(
    (item) => item.sceneKey === summary.sceneKey,
  );
  if (index !== -1) scenes.value[index] = summary;
  if (selected.value?.sceneKey === summary.sceneKey) selected.value = summary;
}
function leaveRisk() {
  return (
    autosave.hasUnconfirmedChanges() ||
    Boolean(pendingCreate.value) ||
    creating.value ||
    (createOpen.value &&
      Boolean(
        newName.value ||
        newPurpose.value ||
        newFormId.value ||
        newKind.value !== 'GENERAL',
      ))
  );
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!leaveRisk()) return;
  event.preventDefault();
  event.returnValue = '';
}
function chooseLeave(allowed: boolean) {
  leaveGeneration++;
  leaveState.value = null;
  const finish = finishLeave;
  finishLeave = undefined;
  finish?.(allowed);
}
onBeforeRouteLeave(() => {
  if (finishLeave) chooseLeave(false);
  if (!leaveRisk()) return true;
  const run = ++leaveGeneration;
  leaveState.value = 'saving';
  const decision = new Promise<boolean>((resolve) => {
    finishLeave = resolve;
  });
  void autosave.flushAll().then(
    (saved) => {
      if (disposed || run !== leaveGeneration) return;
      if (saved && !leaveRisk()) chooseLeave(true);
      else leaveState.value = 'blocked';
    },
    () => {
      if (!disposed && run === leaveGeneration) leaveState.value = 'blocked';
    },
  );
  return decision;
});
function emptyDefinition(scene: SceneSummary): SceneDefinition {
  return {
    name: scene.name,
    purpose: scene.purpose,
    promptText: '',
    outputRequirement: '',
    dataObjects: [],
    modelPolicy: {
      mode: 'FIXED',
      models: [],
      fallback: false,
      outputFormat: 'TEXT',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  };
}
async function loadList() {
  const run = ++loadGeneration;
  loading.value = true;
  try {
    const result = await getSceneWorkspace({
      pageNum: listPage.value,
      pageSize: 100,
      search: search.value,
    });
    if (disposed || run !== loadGeneration) return;
    scenes.value = result.scenes.records;
    listTotal.value = result.scenes.total;
  } catch {
    if (!disposed && run === loadGeneration)
      message.value = '场景读取失败，请重试。';
  } finally {
    if (!disposed && run === loadGeneration) loading.value = false;
  }
}
watch(search, () => {
  listPage.value = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadList(), 300);
});
async function selectScene(key: string) {
  if (!can('query')) {
    message.value = '当前无场景详情权限。';
    return;
  }
  const run = ++detailGeneration;
  switching.value = true;
  try {
    const detail = await getScene(key);
    if (disposed || run !== detailGeneration) return;
    updateSummary(detail.scene);
    if (
      (latestSummaries.get(key)?.revision ?? detail.scene.revision) <=
      detail.scene.revision
    )
      legacyByScene.set(key, detail.legacy ?? null);
    autosave.register(
      key,
      detail.scene.revision,
      detail.definition ?? emptyDefinition(detail.scene),
      editorAllowed(key),
    );
    if (!(await autosave.select(key))) {
      message.value = '请先处理当前场景的未保存内容。';
      return;
    }
    if (disposed || run !== detailGeneration) return;
    selected.value = latestSummaries.get(key) ?? detail.scene;
    trialBusinessRef.value = null;
    variables.value = [];
    legacy.value = legacyByScene.get(key) ?? null;
    converted.value = conversionConsent.has(key);
    view.value = autosave.view(key);
    conflict.value = undefined;
  } catch {
    if (!disposed && run === detailGeneration)
      message.value = '场景详情读取失败，请重试。';
  } finally {
    if (!disposed && run === detailGeneration) switching.value = false;
  }
}
function confirmConversion() {
  if (
    !view.value ||
    !can('edit') ||
    legacy.value?.compatibility !== 'CONVERTIBLE'
  )
    return;
  conversionConsent.add(view.value.sceneKey);
  converted.value = true;
  autosave.setEditable(view.value.sceneKey, true);
}
async function create() {
  if (!can('add') || creating.value || !newName.value.trim()) return;
  if (
    newKind.value === 'RECORD_SUMMARY' &&
    (!newFormId.value || !access.accessCodes.includes('lowcode:record:query'))
  )
    return;
  creating.value = true;
  try {
    pendingCreate.value ??= {
      name: newName.value.trim(),
      purpose: newPurpose.value,
      kind: newKind.value,
      formId: newKind.value === 'RECORD_SUMMARY' ? newFormId.value : null,
      clientMutationId: crypto.randomUUID(),
    };
    const detail = await createScene(pendingCreate.value);
    if (disposed) return;
    pendingCreate.value = undefined;
    createOpen.value = false;
    newName.value = '';
    newPurpose.value = '';
    scenes.value.unshift(detail.scene);
    await selectScene(detail.scene.sceneKey);
  } catch (error) {
    const status = (error as null | { response?: { status?: number } })
      ?.response?.status;
    if (status && status >= 400 && status < 500)
      pendingCreate.value = undefined;
    if (!disposed) message.value = '新建失败，请重试。';
  } finally {
    creating.value = false;
  }
}
async function toggleEnabled() {
  if (!view.value || !selected.value || !can('enable') || toggling.value)
    return;
  const key = view.value.sceneKey;
  toggling.value = true;
  try {
    if (!(await autosave.flush(key))) {
      message.value = '请先处理未保存内容。';
      return;
    }
    const result = await setSceneEnabled(key, {
      expectedRevision: autosave.view(key).revision,
      clientMutationId: crypto.randomUUID(),
      enabled: !selected.value.enabled,
    });
    if (disposed) return;
    updateSummary(result.detail.scene);
    legacyByScene.set(key, result.detail.legacy ?? null);
    if (view.value?.sceneKey === key)
      legacy.value = result.detail.legacy ?? null;
    autosave.register(
      key,
      result.detail.scene.revision,
      result.detail.definition ?? emptyDefinition(result.detail.scene),
      editorAllowed(key),
    );
  } catch {
    if (!disposed) message.value = '启停失败，请刷新场景后重试。';
  } finally {
    toggling.value = false;
  }
}
async function inspectConflict() {
  if (!view.value) return;
  const key = view.value.sceneKey;
  try {
    const detail = await getScene(key);
    if (!disposed && view.value?.sceneKey === key) conflict.value = detail;
  } catch {
    if (!disposed) message.value = '无法读取服务器版本，请稍后重试。';
  }
}
async function resolve(choice: 'keep-local' | 'use-server') {
  if (!view.value || !conflict.value?.definition) return;
  const key = view.value.sceneKey;
  autosave.resolveConflict(
    key,
    {
      revision: conflict.value.scene.revision,
      value: conflict.value.definition,
    },
    choice,
  );
  updateSummary(conflict.value.scene);
  conflict.value = undefined;
  if (choice === 'keep-local') await autosave.retry(key);
}
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload);
  if (can('list')) await loadList();
  if (can('query'))
    try {
      const options = await sceneModels('TEXT');
      if (!disposed) models.value = options;
    } catch {
      if (!disposed) message.value = '模型选项读取失败。';
    }
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  chooseLeave(false);
  disposed = true;
  loadGeneration++;
  detailGeneration++;
  clearTimeout(searchTimer);
  unsubscribe();
  autosave.dispose();
});
</script>

<template>
  <div class="scene-workspace">
    <SceneSidebar
      :active-key="view?.sceneKey ?? null"
      :can-create="can('add')"
      :scenes="scenes"
      :loading="loading"
      :search="search"
      :page="listPage"
      :total="listTotal"
      @page="
        listPage = $event;
        loadList();
      "
      @update:search="search = $event"
      @select="selectScene"
      @create="createOpen = true"
    />
    <main class="scene-main" :aria-busy="switching">
      <ElAlert
        v-if="message"
        :title="message"
        type="warning"
        show-icon
        closable
        @close="message = ''"
      />
      <template v-if="view && selected">
        <header class="scene-heading">
          <div>
            <h1>{{ view.value.name || '未命名场景' }}</h1>
            <SceneSaveStatus
              :phase="view.phase"
              :error="view.error"
              @retry="autosave.retry(view.sceneKey)"
              @conflict="inspectConflict"
            />
          </div>
          <div class="scene-actions">
            <ElButton @click="refreshModels">刷新模型</ElButton>
            <SceneTrialPanel
              v-if="legacy?.compatibility !== 'READ_ONLY'"
              :scene-key="view.sceneKey"
              :definition="view.confirmed"
              :revision="view.revision"
              :version-id="selected.currentVersionId"
              :business-ref="trialBusinessRef"
              :models="models"
              :prepare="prepareTrial"
            />
            <ElPopconfirm
              v-if="can('enable') && selected.enabled"
              title="停用此场景？已有对话仍可查看。"
              confirm-button-text="停用"
              cancel-button-text="保留"
              @confirm="toggleEnabled"
            >
              <template #reference>
                <ElButton :disabled="toggling">停用场景</ElButton>
              </template>
            </ElPopconfirm>
            <ElButton
              v-else-if="can('enable')"
              :disabled="toggling"
              @click="toggleEnabled"
            >
              启用场景
            </ElButton>
            <ElButton
              v-if="view.editable"
              type="primary"
              :disabled="toggling || view.phase === 'saving'"
              @click="saveNow"
            >
              保存
            </ElButton>
          </div>
        </header>
        <p v-if="!selected.currentVersionId" class="scene-state">
          尚未保存有效配置
        </p>
        <p
          v-else-if="selected.availability.state !== 'READY'"
          class="scene-state"
        >
          {{ !selected.enabled ? '场景已停用' : '当前模型暂不可用' }}
        </p>
        <ElCollapse v-if="legacy" class="legacy-notice">
          <ElCollapseItem
            name="compatibility"
            :title="
              legacy.compatibility === 'READ_ONLY'
                ? '旧配置保持只读 · 查看兼容说明'
                : '旧配置兼容说明'
            "
          >
            <p v-for="reason in legacy.reasons" :key="reason">
              {{ legacyReasonLabel(reason) }}
            </p>
            <p v-for="note in legacy.conversionNotes" :key="note">
              {{ legacyConversionLabel(note) }}
            </p>
            <p>原版本保留，首次读取不自动转换。</p>
            <ElButton
              v-if="
                legacy.compatibility === 'CONVERTIBLE' &&
                legacy.requiresConfirmation &&
                !converted &&
                can('edit')
              "
              type="primary"
              @click="confirmConversion"
            >
              确认转换说明，开始编辑
            </ElButton>
            <p v-if="converted">下次有效保存时使用新编辑格式。</p>
            <div v-for="(item, index) in legacy.originalMessages" :key="index">
              <small>{{ item.section }}</small>
              <pre>{{ item.text }}</pre>
            </div>
            <pre v-if="legacy.originalMessages.length === 0">{{
              JSON.stringify(legacy.originalDefinition, null, 2)
            }}</pre>
          </ElCollapseItem>
        </ElCollapse>
        <PromptEditor
          v-if="legacy?.compatibility !== 'READ_ONLY'"
          ref="promptEditor"
          :value="view.value"
          :readonly="!view.editable || toggling"
          :models="models"
          :fields="view.fields"
          :variables="allVariables"
          @change="autosave.edit(view.sceneKey, $event)"
        >
          <template #data>
            <SceneDataSelector
              v-if="selected.source === 'LEGACY_V04'"
              :key="view.sceneKey"
              :value="view.value.dataObjects"
              :fixed-form-id="selected.formId"
              :readonly="!view.editable || toggling"
              @variables="variables = $event"
              @change="
                autosave.edit(view.sceneKey, {
                  ...view.value,
                  dataObjects: $event,
                })
              "
            />
            <DatabaseBindingEditor
              v-else
              :key="view.sceneKey"
              :value="view.value.dataBindings ?? []"
              :readonly="!view.editable || toggling"
              :prepare-preview="preparePreview"
              :read-preview="readDataPreview"
              :preview-disabled="
                !can('test') || !access.accessCodes.includes('ai:scene:invoke')
              "
              @change="
                autosave.edit(view.sceneKey, {
                  ...view.value,
                  dataBindings: $event,
                })
              "
              @insert="insertBinding"
              @context="trialBusinessRef = $event ?? null"
            />
          </template>
        </PromptEditor>
      </template>
      <ElEmpty
        v-else
        description="从左侧选择或新建一个提示词场景"
        :image-size="100"
      >
        <ElButton @click="loadList">重新读取</ElButton>
      </ElEmpty>
    </main>
    <ElDialog
      :model-value="dialogOpen"
      :title="dialogTitle"
      :aria-label="dialogTitle"
      width="min(620px, 94vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!leaveState"
      :show-close="!leaveState"
      :before-close="closeWorkspaceDialog"
    >
      <template v-if="leaveState">
        <p class="dialog-copy">
          {{ leaveState === 'saving' ? '正在保存后离开…' : '仍有未确认内容' }}
        </p>
        <p class="dialog-copy">
          本地输入仅保留在本页会话中。离开、刷新或关闭可能丢失未确认内容；已经发出的请求仍可能在服务端完成。
        </p>
      </template>
      <template v-else-if="conflict">
        <p class="dialog-copy">
          本地输入已保留，可选择服务器内容，或基于最新版本重新保存本地内容。
        </p>
        <pre class="conflict-content">{{
          conflict.definition?.promptText
        }}</pre>
      </template>
      <ElForm
        v-else
        label-position="top"
        aria-label="新建场景"
        :disabled="creating || Boolean(pendingCreate)"
        @submit.prevent="create"
      >
        <p v-if="pendingCreate" class="dialog-copy">
          上次创建受理尚未确认，重试仍使用原请求。
        </p>
        <ElFormItem label="场景类型">
          <ElRadioGroup v-model="newKind" aria-label="新建场景类型">
            <ElRadioButton value="GENERAL">通用场景</ElRadioButton>
            <ElRadioButton
              v-if="access.accessCodes.includes('lowcode:record:query')"
              value="RECORD_SUMMARY"
            >
              记录摘要
            </ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem
          v-if="newKind === 'RECORD_SUMMARY'"
          label="绑定表单"
          required
        >
          <SceneFormPicker
            :value="newFormId"
            :disabled="creating || Boolean(pendingCreate)"
            @change="newFormId = $event"
          />
        </ElFormItem>
        <ElFormItem label="场景名称" required>
          <ElInput
            v-model="newName"
            aria-label="新建场景名称"
            maxlength="120"
          />
        </ElFormItem>
        <ElFormItem label="用途">
          <ElInput v-model="newPurpose" aria-label="新建场景用途" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <template v-if="leaveState">
          <ElButton type="primary" @click="chooseLeave(false)">
            留在当前页
          </ElButton>
          <ElButton @click="chooseLeave(true)">放弃未确认内容并离开</ElButton>
        </template>
        <template v-else-if="conflict">
          <ElButton @click="resolve('use-server')">使用服务器内容</ElButton>
          <ElButton type="primary" @click="resolve('keep-local')">
            保留本地并重新保存
          </ElButton>
        </template>
        <template v-else>
          <ElButton :disabled="creating" @click="createOpen = false">
            取消
          </ElButton>
          <ElButton
            type="primary"
            :loading="creating"
            :disabled="
              !newName.trim() || (newKind === 'RECORD_SUMMARY' && !newFormId)
            "
            @click="create"
          >
            {{ pendingCreate ? '重试创建' : '创建场景' }}
          </ElButton>
        </template>
      </template>
    </ElDialog>
  </div>
</template>
<style scoped>
.scene-workspace {
  display: flex;
  min-height: calc(100vh - 150px);
  margin: 16px;
  overflow: hidden;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border-radius: 10px;
}

.scene-main {
  display: grid;
  flex: 1;
  gap: 20px;
  align-content: start;
  min-width: 0;
  padding: 24px;
}

.scene-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: flex-start;
  justify-content: space-between;
}

h1 {
  margin-bottom: 8px;
  font-size: 21px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.scene-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.scene-actions :deep(.el-button) {
  margin: 0;
}

.scene-state,
.dialog-copy {
  font-size: 13px;
  line-height: 1.8;
  color: hsl(var(--muted-foreground));
}

.legacy-notice {
  font-size: 13px;
}

.legacy-notice pre,
.conflict-content {
  padding: 16px;
  overflow: auto;
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--muted) / 45%);
  border-radius: 8px;
}

.dialog-copy {
  margin-bottom: 16px;
}

@media (max-width: 1100px) {
  .scene-main {
    padding: 20px;
  }
}

@media (max-width: 900px) {
  .scene-workspace {
    flex-direction: column;
    margin: 8px;
  }

  .scene-main {
    padding: 16px;
  }

  .scene-actions {
    width: 100%;
  }
}
</style>
