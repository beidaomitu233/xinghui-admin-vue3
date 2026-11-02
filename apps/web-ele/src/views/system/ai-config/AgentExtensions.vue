<script setup lang="ts">
import type {
  AgentExtension,
  ExtensionDraft,
  ExtensionKind,
  McpTool,
} from '#/api/system/ai-extensions';

import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import {
  discoverMcpTools,
  listAgentExtensions,
  saveAgentExtension,
} from '#/api/system/ai-extensions';

const props = defineProps<{ kind: ExtensionKind }>();
const access = useAccessStore();
const allowed = computed(() =>
  access.accessCodes.some((code) =>
    ['ai:config:list', 'ai:config:query'].includes(code),
  ),
);
const editable = computed(() => access.accessCodes.includes('ai:config:edit'));
const names = { SKILL: 'Skill', MCP: 'MCP', KNOWLEDGE: '外部知识库' };
const rows = ref<AgentExtension[]>([]);
const loading = ref(false);
const saving = ref(false);
const discovering = ref(false);
const error = ref('');
const open = ref(false);
const builtin = ref(false);
const draft = ref<ExtensionDraft>();
const tools = ref<McpTool[]>([]);
let generation = 0;
let alive = true;
const visible = computed(() =>
  rows.value.filter((row) => row.kind === props.kind),
);
const readonly = computed(() => builtin.value || !editable.value);
const identity = computed(() =>
  JSON.stringify([access.accessToken, access.accessCodes]),
);
async function load() {
  const ticket = ++generation;
  if (!allowed.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await listAgentExtensions();
    if (alive && ticket === generation) rows.value = result;
  } catch {
    if (alive && ticket === generation)
      error.value = '扩展列表读取失败，请重试。';
  } finally {
    if (alive && ticket === generation) loading.value = false;
  }
}
function edit(row?: AgentExtension) {
  builtin.value = Boolean(row?.id.startsWith('builtin:'));
  tools.value = [];
  draft.value = row
    ? { ...structuredClone(toRaw(row)), secret: '', clearSecret: false }
    : {
        kind: props.kind,
        code: '',
        name: '',
        description: '',
        enabled: false,
        config:
          props.kind === 'SKILL'
            ? { content: '', permission: '' }
            : {
                url: '',
                permission: '',
                ...(props.kind === 'MCP'
                  ? {
                      transport: 'HTTP',
                      headerName: 'Authorization',
                      tools: [],
                      allowWrites: false,
                    }
                  : { provider: 'DIFY', datasetId: '', topK: 5 }),
              },
        secret: '',
        clearSecret: false,
      };
  open.value = true;
}
async function save() {
  if (!draft.value || readonly.value || saving.value) return;
  if (
    !draft.value.name.trim() ||
    !/^[a-z][a-z0-9_-]{1,63}$/.test(draft.value.code)
  ) {
    ElMessage.warning(
      '请填写名称和标识：以小写字母开头，2至64位字母、数字、下划线或短横线。',
    );
    return;
  }
  const actor = identity.value;
  saving.value = true;
  try {
    const result = await saveAgentExtension(draft.value);
    if (!alive || actor !== identity.value) return;
    draft.value = { ...result, secret: '', clearSecret: false };
    ElMessage.success('已保存，新任务使用此配置');
    await load();
  } finally {
    saving.value = false;
  }
}
async function discover() {
  if (!draft.value?.id || discovering.value) return;
  const id = draft.value.id;
  const actor = identity.value;
  discovering.value = true;
  try {
    const result = await discoverMcpTools(id);
    if (alive && actor === identity.value && draft.value?.id === id)
      tools.value = result;
  } finally {
    discovering.value = false;
  }
}
function beforeClose(done: () => void) {
  if (!saving.value) done();
}
watch(
  identity,
  () => {
    open.value = false;
    draft.value = undefined;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>

<template>
  <section :aria-label="`${names[kind]}列表`">
    <div class="mb-4 flex items-center justify-between gap-4">
      <span class="text-sm text-muted-foreground">
        {{ visible.length }} 个{{ names[kind] }}
      </span>
      <ElButton v-if="editable" type="primary" @click="edit()">
        添加{{ names[kind] }}
      </ElButton>
    </div>
    <ElEmpty v-if="!allowed" description="无扩展配置查看权限" />
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false">
      <ElButton link @click="load">重试</ElButton>
    </ElAlert>
    <ElTable
      v-else
      v-loading="loading"
      :data="visible"
      row-key="id"
      empty-text="尚未添加"
      max-height="480"
    >
      <ElTableColumn prop="name" label="名称" min-width="160" sortable />
      <ElTableColumn
        prop="description"
        label="用途"
        min-width="240"
        show-overflow-tooltip
      />
      <ElTableColumn label="来源" width="130">
        <template #default="{ row }">
          {{
            row.id.startsWith('builtin:')
              ? '内置'
              : row.config.provider || '自定义'
          }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="状态" width="100">
        <template #default="{ row }">
          <ElTag :type="row.enabled ? 'success' : 'info'">
            {{ row.enabled ? '启用' : '停用' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="100">
        <template #default="{ row }">
          <ElButton link type="primary" @click="edit(row)">
            {{ editable && !row.id.startsWith('builtin:') ? '编辑' : '查看' }}
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
    <ElDrawer
      v-model="open"
      :title="names[kind]"
      size="min(760px, 96vw)"
      :close-on-click-modal="false"
      :before-close="beforeClose"
    >
      <ElForm v-if="draft" label-position="top" :disabled="readonly || saving">
        <div class="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          <ElFormItem label="名称" required>
            <ElInput v-model="draft.name" maxlength="100" />
          </ElFormItem>
          <ElFormItem label="标识" required>
            <ElInput
              v-model="draft.code"
              :disabled="Boolean(draft.id)"
              placeholder="如 sales-helper"
              maxlength="64"
            />
          </ElFormItem>
        </div>
        <ElFormItem label="用途">
          <ElInput
            v-model="draft.description"
            type="textarea"
            :rows="2"
            maxlength="1000"
          />
        </ElFormItem>
        <ElFormItem label="启用">
          <ElSwitch v-model="draft.enabled" />
        </ElFormItem>
        <ElFormItem label="调用权限">
          <ElInput
            v-model="draft.config.permission"
            placeholder="可选，如 sales:report:query"
          />
        </ElFormItem>
        <ElFormItem
          v-if="kind === 'SKILL'"
          label="Skill 内容（Markdown）"
          required
        >
          <ElInput
            v-model="draft.config.content"
            type="textarea"
            :rows="18"
            maxlength="32768"
          />
        </ElFormItem>
        <template v-else>
          <ElFormItem v-if="kind === 'KNOWLEDGE'" label="服务商">
            <ElSelect v-model="draft.config.provider">
              <ElOption label="Dify" value="DIFY" />
              <ElOption label="FastGPT" value="FASTGPT" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="kind === 'MCP'" label="传输方式">
            <ElSelect v-model="draft.config.transport">
              <ElOption label="Streamable HTTP" value="HTTP" />
              <ElOption label="SSE" value="SSE" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="服务地址" required>
            <ElInput
              v-model="draft.config.url"
              :placeholder="
                kind === 'MCP'
                  ? 'https://example.com/mcp'
                  : 'Dify：https://example.com/v1；FastGPT：https://example.com/api'
              "
            />
          </ElFormItem>
          <ElFormItem v-if="kind === 'MCP'" label="认证请求头">
            <ElInput
              v-model="draft.config.headerName"
              placeholder="Authorization"
            />
          </ElFormItem>
          <ElFormItem
            :label="draft.secretSet ? '密钥（已设置，留空保持）' : '密钥'"
          >
            <ElInput
              v-model="draft.secret"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </ElFormItem>
          <ElFormItem v-if="draft.secretSet">
            <ElCheckbox v-model="draft.clearSecret">清除已保存密钥</ElCheckbox>
          </ElFormItem>
          <template v-if="kind === 'KNOWLEDGE'">
            <ElFormItem label="数据集 ID" required>
              <ElInput v-model="draft.config.datasetId" />
            </ElFormItem>
            <ElFormItem label="最多返回片段数">
              <ElInputNumber v-model="draft.config.topK" :min="1" :max="20" />
            </ElFormItem>
          </template>
          <template v-else>
            <ElFormItem label="允许执行写入工具">
              <ElSwitch v-model="draft.config.allowWrites" />
            </ElFormItem>
            <ElAlert
              class="mb-4"
              type="info"
              :closable="false"
              title="计划模式只注册只读工具；写入工具需启用并使用直接处理模式。"
            />
            <ElButton
              :disabled="
                !draft.id || !access.accessCodes.includes('ai:config:query')
              "
              :loading="discovering"
              @click="discover"
            >
              读取已保存服务的工具
            </ElButton>
            <p v-if="!draft.id" class="mt-2 text-sm text-muted-foreground">
              保存后可读取工具列表。
            </p>
            <ElFormItem
              v-if="tools.length > 0"
              label="启用工具（不选择则使用全部可用工具）"
              class="mt-4"
            >
              <ElCheckboxGroup v-model="draft.config.tools" class="w-full">
                <div
                  v-for="tool in tools"
                  :key="tool.name"
                  class="border-b py-3"
                >
                  <ElCheckbox :value="tool.name">
                    {{ tool.name }} · {{ tool.readOnly ? '只读' : '写入' }}
                  </ElCheckbox>
                  <p class="text-sm text-muted-foreground">
                    {{ tool.description }}
                  </p>
                  <details class="mt-2 text-xs">
                    <summary>参数</summary>
                    <pre class="mt-2 overflow-auto whitespace-pre-wrap">{{
                      JSON.stringify(tool.inputSchema, null, 2)
                    }}</pre>
                  </details>
                </div>
              </ElCheckboxGroup>
            </ElFormItem>
            <p
              v-else-if="
                Array.isArray(draft.config.tools) &&
                draft.config.tools.length > 0
              "
              class="mt-4 text-sm"
            >
              已选择：{{ draft.config.tools.join('、') }}
            </p>
          </template>
        </template>
      </ElForm>
      <template #footer>
        <ElButton :disabled="saving" @click="open = false">关闭</ElButton>
        <ElButton
          v-if="!readonly"
          type="primary"
          :loading="saving"
          @click="save"
        >
          保存
        </ElButton>
      </template>
    </ElDrawer>
  </section>
</template>
