<script setup lang="ts">
import type { SaveView } from './ordered-autosave';

import type {
  SceneCreate,
  SceneDefinition,
  SceneDetail,
  SceneLegacy,
  SceneModelOption,
  SceneSummary,
} from '#/api/system/ai-scene';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  createScene,
  getScene,
  getSceneWorkspace,
  sceneModels,
  setSceneEnabled,
} from '#/api/system/ai-scene';

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
const converted = ref(false);
const legacyByScene = new Map<string, null | SceneLegacy>();
const conversionConsent = new Set<string>();
const mutationConsent = new Map<string, boolean>();
const variables = ref<{ label: string; name: string }[]>([]);
const leaveState = ref<'blocked' | 'saving' | null>(null);
let finishLeave: ((allowed: boolean) => void) | undefined;
let leaveGeneration = 0;
let loadGeneration = 0;
let detailGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const latestSummaries = new Map<string, SceneSummary>();
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
    <main :aria-busy="switching">
      <div v-if="message" class="message" role="alert">
        <span>{{ message }}</span>
        <button type="button" @click="message = ''">关闭</button>
      </div>
      <template v-if="view && selected">
        <header>
          <div>
            <h1>{{ view.value.name || '未命名场景' }}</h1>
            <SceneSaveStatus
              :phase="view.phase"
              :error="view.error"
              @retry="autosave.retry(view.sceneKey)"
              @conflict="inspectConflict"
            />
          </div>
          <button
            v-if="can('enable')"
            type="button"
            :disabled="toggling"
            @click="toggleEnabled"
          >
            {{ selected.enabled ? '停用场景' : '启用场景' }}
          </button>
        </header>
        <p v-if="!selected.currentVersionId" class="availability">
          尚未保存有效配置
        </p>
        <p
          v-else-if="selected.availability.state !== 'READY'"
          class="availability"
        >
          {{ !selected.enabled ? '场景已停用' : '当前模型暂不可用' }}
          <span v-for="reason in selected.availability.reasons" :key="reason">
            {{ reason }}
          </span>
        </p>
        <section v-if="conflict" class="conflict" aria-label="处理版本冲突">
          <h2>服务器版本已变化</h2>
          <p>
            本地输入已保留。选择使用服务器内容，或基于服务器最新版本保存本地内容。
          </p>
          <pre>{{ conflict.definition?.promptText }}</pre>
          <button type="button" @click="resolve('use-server')">
            使用服务器内容
          </button>
          <button type="button" @click="resolve('keep-local')">
            保留本地并重新保存
          </button>
        </section>
        <section v-if="legacy" class="legacy-notice">
          <h2>
            {{
              legacy.compatibility === 'READ_ONLY'
                ? '此旧配置保持只读'
                : '旧配置格式转换'
            }}
          </h2>
          <p v-for="reason in legacy.reasons" :key="reason">{{ reason }}</p>
          <p v-for="note in legacy.conversionNotes" :key="note">{{ note }}</p>
          <p>原版本继续保留；首次读取不会保存或转换。</p>
          <button
            v-if="
              legacy.compatibility === 'CONVERTIBLE' &&
              legacy.requiresConfirmation &&
              !converted &&
              can('edit')
            "
            type="button"
            @click="confirmConversion"
          >
            确认转换说明，开始编辑
          </button>
          <p v-if="converted">将在下次有效保存时使用新编辑格式。</p>
          <details>
            <summary>查看原内容</summary>
            <div v-for="(item, index) in legacy.originalMessages" :key="index">
              <small>{{ item.section }}</small>
              <pre>{{ item.text }}</pre>
            </div>
            <pre v-if="legacy.originalMessages.length === 0">{{
              JSON.stringify(legacy.originalDefinition, null, 2)
            }}</pre>
          </details>
        </section>
        <PromptEditor
          v-if="legacy?.compatibility !== 'READ_ONLY'"
          :value="view.value"
          :readonly="!view.editable || toggling"
          :models="models"
          :fields="view.fields"
          :variables="variables"
          @change="autosave.edit(view.sceneKey, $event)"
        >
          <template #data>
            <SceneDataSelector
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
          </template>
        </PromptEditor>
        <SceneTrialPanel
          v-if="legacy?.compatibility !== 'READ_ONLY'"
          :scene-key="view.sceneKey"
          :definition="view.confirmed"
          :revision="view.revision"
          :version-id="selected.currentVersionId"
        />
      </template>
      <section v-else class="empty">
        <h1>提示词配置</h1>
        <p>从左侧选择场景，或新建一个场景开始配置。</p>
        <button type="button" @click="loadList">重新读取</button>
      </section>
    </main>
    <div v-if="leaveState" class="dialog-backdrop leave-dialog-backdrop">
      <section
        class="create-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="离开前处理未确认内容"
      >
        <h2>
          {{ leaveState === 'saving' ? '正在保存后离开…' : '仍有未确认内容' }}
        </h2>
        <p>
          本地输入仅保留在本页会话中。离开、刷新或关闭页面可能丢失未确认内容；已经发出的请求仍可能在服务端完成。
        </p>
        <div>
          <button type="button" @click="chooseLeave(false)">留在当前页</button>
          <button type="button" @click="chooseLeave(true)">
            放弃未确认内容并离开
          </button>
        </div>
      </section>
    </div>
    <div v-if="createOpen" class="dialog-backdrop">
      <form
        class="create-dialog"
        aria-label="新建场景"
        @submit.prevent="create"
      >
        <h2>新建场景</h2>
        <p v-if="pendingCreate" class="availability">
          上次创建受理尚未确认，重试将使用原请求。
        </p>
        <label>
          场景类型
          <select
            v-model="newKind"
            :disabled="creating || Boolean(pendingCreate)"
          >
            <option value="GENERAL">通用场景</option>
            <option
              v-if="access.accessCodes.includes('lowcode:record:query')"
              value="RECORD_SUMMARY"
            >
              记录摘要
            </option>
          </select>
        </label>
        <SceneFormPicker
          v-if="newKind === 'RECORD_SUMMARY'"
          :value="newFormId"
          :disabled="creating || Boolean(pendingCreate)"
          @change="newFormId = $event"
        />
        <label>
          场景名称
          <input
            v-model="newName"
            required
            maxlength="120"
            :disabled="Boolean(pendingCreate)"
          />
        </label>
        <label>
          用途（可选）
          <input v-model="newPurpose" :disabled="Boolean(pendingCreate)" />
        </label>
        <div>
          <button
            type="button"
            :disabled="creating"
            @click="createOpen = false"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="
              creating ||
              !newName.trim() ||
              (newKind === 'RECORD_SUMMARY' && !newFormId)
            "
          >
            {{ creating ? '正在创建…' : '创建场景' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.scene-workspace {
  display: flex;
  min-height: calc(100vh - 150px);
  margin: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
main {
  min-width: 0;
  flex: 1;
  padding: 28px 36px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  margin-bottom: 24px;
}
h1 {
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}
h2 {
  font-weight: 600;
}
button {
  color: hsl(var(--primary));
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.message {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 10px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.availability,
.data-objects p,
.trial p {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  margin: 10px 0 20px;
}
.data-objects {
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.trial {
  border-top: 1px solid hsl(var(--border));
  margin-top: 28px;
  padding-top: 20px;
}
summary {
  cursor: pointer;
}
.empty {
  text-align: center;
  padding-top: 160px;
  color: hsl(var(--muted-foreground));
}
.empty p {
  margin: 16px 0;
}
.conflict {
  padding: 16px;
  border: 1px solid #b66a19;
  border-radius: 8px;
  margin-bottom: 20px;
}
.legacy-notice {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  font-size: 13px;
}
.legacy-notice p {
  margin: 8px 0;
  color: hsl(var(--muted-foreground));
}
.legacy-notice pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 240px;
  overflow: auto;
  margin: 12px 0;
}
.conflict pre {
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  margin: 12px 0;
}
.conflict button {
  margin-right: 20px;
}
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  background: #0005;
}
.leave-dialog-backdrop {
  z-index: 1100;
}
.create-dialog {
  display: grid;
  gap: 20px;
  width: min(480px, 90vw);
  padding: 28px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--background));
}
.create-dialog label {
  display: grid;
  gap: 8px;
}
.create-dialog input {
  padding: 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: transparent;
}
.create-dialog form,
.create-dialog div {
  display: flex;
  justify-content: flex-end;
  gap: 24px;
}
@media (max-width: 1100px) {
  main {
    padding: 24px;
  }
}
@media (max-width: 720px) {
  .scene-workspace {
    flex-direction: column;
  }
  main {
    padding: 20px;
  }
}
</style>
