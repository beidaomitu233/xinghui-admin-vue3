<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';

import {
  ElAlert,
  ElButton,
  ElCard,
  ElEmpty,
  ElInput,
  ElMenu,
  ElMenuItem,
  ElMessageBox,
  ElOption,
  ElScrollbar,
  ElSelect,
  ElSkeleton,
  ElStep,
  ElSteps,
  ElTag,
} from 'element-plus';

import { aiErrorMessage } from '#/api/system/ai-runtime-errors';

import { runLabels } from './history';
import MarkdownMessage from './MarkdownMessage.vue';
import { useWorkbench } from './use-workbench';

defineOptions({ name: 'AiWorkbench' });
const {
  allowed,
  sessions,
  presets,
  selected,
  sceneKey,
  draft,
  error,
  loading,
  sending,
  cancelling,
  history,
  pending,
  status,
  running,
  select,
  refresh,
  create,
  send,
  cancel,
  rename,
} = useWorkbench();
const scroll = ref<InstanceType<typeof ElScrollbar>>();
const search = ref('');
const showTasks = ref(true);
const following = ref(true);
const conversation = computed(() =>
  history.messages.filter(
    (message) => message.role !== 'TOOL' && message.text.trim(),
  ),
);
const sendLabel = computed(() => {
  if (sending.value) return '发送中';
  return pending.value ? '重试提交' : '发送';
});
const visibleSessions = computed(() =>
  sessions.value.filter((item) =>
    item.title
      .toLocaleLowerCase()
      .includes(search.value.trim().toLocaleLowerCase()),
  ),
);
const phase = computed(() => {
  if (!running.value && status.value) return runLabels[status.value];
  if (status.value === 'QUEUED' || status.value === 'CANCELLING')
    return runLabels[status.value];
  const step = history.steps.find((item) => item.status === 'IN_PROGRESS');
  if (step) return step.title;
  return running.value ? '正在处理任务' : '等待任务';
});
function choose(id: string) {
  const item = sessions.value.find((entry) => entry.id === id);
  if (item) {
    following.value = true;
    void select(item);
  }
}
function onScroll() {
  const element = scroll.value?.wrapRef;
  if (element)
    following.value =
      element.scrollHeight - element.clientHeight - element.scrollTop < 80;
}
watch(
  () => [history.cursor, selected.value?.id],
  async () => {
    await nextTick();
    if (following.value) {
      const element = scroll.value?.wrapRef;
      if (element) scroll.value?.setScrollTop(element.scrollHeight);
    }
  },
);
async function renameCurrent() {
  if (!selected.value) return;
  try {
    const value = await ElMessageBox.prompt('请输入会话名称', '重命名会话', {
      inputValue: selected.value.title,
      inputValidator: (text: string) =>
        (Boolean(text?.trim()) && text.trim().length <= 160) ||
        '请输入1至160个字符',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    });
    await rename(value.value.trim());
  } catch {
    /* The request client handles safe errors; cancelling the native dialog needs no message. */
  }
}
function enter(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) return;
  if (!event.isComposing && !event.shiftKey) {
    event.preventDefault();
    following.value = true;
    void send();
  }
}
</script>

<template>
  <Page
    auto-content-height
    title="AI工作台"
    header-class="flex-wrap gap-3"
    content-class="flex min-h-0 flex-col gap-4"
  >
    <div class="flex shrink-0 gap-2" aria-label="工作台操作">
      <ElButton :disabled="!allowed || loading || sending" @click="create">
        新建会话
      </ElButton>
      <ElButton
        :disabled="!allowed || sending"
        :loading="loading"
        @click="refresh"
      >
        刷新
      </ElButton>
      <ElButton :aria-pressed="showTasks" @click="showTasks = !showTasks">
        任务进度
      </ElButton>
    </div>
    <ElEmpty v-if="!allowed" description="暂无AI工作台使用权限" />
    <section
      v-else
      class="agent-layout flex-1"
      :class="{ 'without-tasks': !showTasks }"
      aria-label="AI工作区"
    >
      <aside class="agent-sessions" aria-label="会话历史">
        <h2>会话</h2>
        <ElInput
          v-model="search"
          clearable
          placeholder="搜索会话"
          aria-label="搜索会话"
        />
        <ElScrollbar class="session-scroll">
          <ElMenu :default-active="selected?.id ?? ''" @select="choose">
            <ElMenuItem
              v-for="item in visibleSessions"
              :key="item.id"
              :index="item.id"
              :disabled="loading || sending"
            >
              <span class="session-title" :title="item.title">
                {{ item.title }}
              </span>
            </ElMenuItem>
          </ElMenu>
          <ElEmpty
            v-if="!loading && visibleSessions.length === 0"
            :image-size="64"
            description="暂无会话"
          />
        </ElScrollbar>
      </aside>
      <main class="agent-chat" aria-label="任务对话">
        <header class="chat-heading">
          <h2>{{ selected?.title ?? '新任务' }}</h2>
          <ElButton
            v-if="selected"
            link
            :disabled="loading || sending"
            @click="renameCurrent"
          >
            重命名
          </ElButton>
          <ElSelect
            class="mobile-sessions"
            :model-value="selected?.id"
            placeholder="选择会话"
            aria-label="选择会话"
            filterable
            :disabled="loading || sending"
            @change="choose"
          >
            <ElOption
              v-for="item in sessions"
              :key="item.id"
              :value="item.id"
              :label="item.title"
            />
          </ElSelect>
        </header>
        <ElAlert
          v-if="error"
          class="chat-error"
          type="error"
          :title="error"
          :closable="false"
          show-icon
        />
        <ElScrollbar ref="scroll" class="chat-scroll" @scroll="onScroll">
          <div
            class="chat-content"
            aria-label="对话记录"
            aria-live="polite"
            aria-relevant="additions text"
          >
            <ElSkeleton
              v-if="loading && conversation.length === 0"
              :rows="4"
              animated
            />
            <ElEmpty
              v-else-if="conversation.length === 0"
              :image-size="88"
              description="开始新的任务"
            >
              <ElButton
                v-if="!selected"
                type="primary"
                :disabled="loading || sending"
                @click="create"
              >
                新建会话
              </ElButton>
            </ElEmpty>
            <article
              v-for="message in conversation"
              :key="message.id"
              v-show="
                message.role !== 'ASSISTANT' || Boolean(message.text.trim())
              "
              class="chat-message"
              :class="message.role.toLowerCase()"
            >
              <h3>{{ message.role === 'USER' ? '你' : 'AI' }}</h3>
              <MarkdownMessage
                v-if="message.role === 'ASSISTANT'"
                :text="message.text"
              />
              <div v-else class="message-text">{{ message.text }}</div>
            </article>
            <p v-if="running" class="run-indicator" role="status">
              {{ phase }}
            </p>
          </div>
        </ElScrollbar>
        <form class="chat-composer" @submit.prevent="send">
          <ElInput
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            :maxlength="32000"
            resize="none"
            placeholder="描述要完成的业务任务…"
            aria-label="任务内容"
            :disabled="!selected || running || sending || Boolean(pending)"
            @keydown.enter="enter"
          />
          <div class="composer-actions">
            <ElSelect
              v-model="sceneKey"
              aria-label="Agent提示词"
              placeholder="选择Agent提示词"
              :disabled="running || sending || Boolean(pending)"
            >
              <ElOption
                v-for="item in presets"
                :key="item.sceneKey"
                :label="item.name"
                :value="item.sceneKey"
              />
            </ElSelect>
            <span v-if="presets.length === 0 && !loading" class="preset-empty">
              暂无可用提示词
            </span>
            <span class="composer-spacer"></span>
            <ElButton
              v-if="running"
              :loading="cancelling"
              :disabled="status === 'CANCELLING'"
              @click="cancel"
            >
              停止任务
            </ElButton>
            <ElButton
              v-if="pending || !running"
              type="primary"
              native-type="submit"
              :loading="sending"
              :disabled="
                loading ||
                (!pending && (!selected || !sceneKey || !draft.trim()))
              "
            >
              {{ sendLabel }}
            </ElButton>
          </div>
        </form>
      </main>
      <aside v-if="showTasks" class="agent-progress" aria-label="任务进度">
        <ElCard shadow="never">
          <template #header>
            <div class="progress-heading">
              <h2>任务进度</h2>
              <ElTag
                v-if="status"
                size="small"
                :type="
                  status === 'COMPLETED'
                    ? 'success'
                    : status === 'FAILED' || status === 'INTERRUPTED'
                      ? 'danger'
                      : 'info'
                "
              >
                {{ runLabels[status] }}
              </ElTag>
            </div>
          </template>
          <p class="phase-label">当前阶段</p>
          <p class="phase-value" role="status">{{ phase }}</p>
          <ElAlert
            v-if="history.errorCode"
            type="warning"
            :title="aiErrorMessage(history.errorCode)"
            :closable="false"
          />
          <ElSteps
            v-if="history.steps.length > 0"
            direction="vertical"
            class="task-steps"
          >
            <ElStep
              v-for="step in history.steps"
              :key="step.id"
              :title="step.title"
              :status="
                step.status === 'COMPLETED'
                  ? 'finish'
                  : step.status === 'IN_PROGRESS'
                    ? 'process'
                    : 'wait'
              "
            />
          </ElSteps>
          <ElEmpty v-else :image-size="56" description="暂无任务步骤" />
        </ElCard>
      </aside>
    </section>
  </Page>
</template>

<style scoped>
.agent-layout {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 264px;
  gap: 16px;
  height: 100%;
  min-height: 0;
}
.agent-layout.without-tasks {
  grid-template-columns: 208px minmax(0, 1fr);
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  font-size: 14px;
  font-weight: 600;
}
.agent-sessions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 8px 0;
}
.session-scroll {
  flex: 1;
  min-height: 0;
}
.agent-sessions :deep(.el-menu) {
  background: transparent;
  border: 0;
}
.agent-sessions :deep(.el-menu-item) {
  height: 44px;
  border-radius: 4px;
  padding: 0 12px;
}
.agent-sessions :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary-light-9);
}
.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
}
.chat-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.chat-heading h2 {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-error {
  flex-shrink: 0;
}
.chat-scroll {
  flex: 1;
  min-height: 0;
}
.chat-content {
  width: min(100%, 832px);
  margin: 0 auto;
  padding: 24px 32px;
}
.chat-message {
  margin-bottom: 24px;
}
.chat-message h3 {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}
.chat-message.user {
  padding: 16px 20px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.message-text {
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.chat-message.tool {
  margin-bottom: 12px;
}
.chat-message.tool :deep(.el-tag) {
  max-width: 100%;
  height: auto;
  min-height: 24px;
  white-space: normal;
}
.run-indicator,
.phase-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.chat-composer {
  flex-shrink: 0;
  padding: 16px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.composer-actions :deep(.el-select) {
  width: 240px;
  max-width: 50%;
}
.composer-spacer {
  flex: 1;
}
.preset-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.agent-progress {
  min-height: 0;
  overflow: auto;
}
.agent-progress :deep(.el-card) {
  border-radius: 6px;
}
.progress-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.phase-value {
  margin: 8px 0 20px;
  line-height: 1.6;
}
.task-steps {
  margin-top: 24px;
}
.task-steps :deep(.el-step__main) {
  padding-bottom: 24px;
}
.task-steps :deep(.el-step__title) {
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.mobile-sessions {
  display: none;
}
@media (max-width: 1200px) {
  .agent-layout {
    grid-template-columns: 176px minmax(0, 1fr) 224px;
    gap: 12px;
  }
  .agent-layout.without-tasks {
    grid-template-columns: 176px minmax(0, 1fr);
  }
  .chat-content {
    padding: 24px;
  }
}
@media (max-width: 960px) {
  .agent-layout,
  .agent-layout.without-tasks {
    grid-template-columns: minmax(0, 1fr);
  }
  .agent-sessions {
    display: none;
  }
  .agent-progress {
    max-height: 240px;
  }
  .agent-layout:not(.without-tasks) {
    grid-template-rows: minmax(320px, 1fr) auto;
  }
  .mobile-sessions {
    display: block;
    width: 120px;
    flex-shrink: 0;
  }
  .chat-heading,
  .chat-composer {
    padding: 12px 16px;
  }
  .chat-content {
    padding: 20px 16px;
  }
  .preset-empty {
    display: none;
  }
}
</style>
