import type {
  AgentPreset,
  AgentRun,
  AgentSession,
  AgentSubmission,
} from '#/api/system/ai-workbench';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  cancelAgentRun,
  createAgentSession,
  getAgentEvents,
  getAgentRun,
  getAgentSession,
  listAgentPresets,
  listAgentSessions,
  renameAgentSession,
  submitAgentRun,
} from '#/api/system/ai-workbench';

import { applyEvents, emptyHistory, isRunning } from './history';

/** Polling only reads durable events. Only a deliberate send/retry can submit a task. */
export function useWorkbench() {
  const access = useAccessStore();
  const allowed = computed(
    () =>
      Boolean(access.accessToken) &&
      access.accessCodes.includes('ai:agent:invoke'),
  );
  const presets = ref<AgentPreset[]>([]);
  const sessions = ref<AgentSession[]>([]);
  const run = ref<AgentRun | null>(null);
  const selected = ref<AgentSession | null>(null);
  const draft = ref('');
  const error = ref('');
  const sceneKey = ref('');
  const cancelling = ref(false);
  const loading = ref(false);
  const sending = ref(false);
  const history = reactive(emptyHistory());
  const pending = ref<null | {
    sessionId: string;
    submission: AgentSubmission;
  }>(null);
  let epoch = 0;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const status = computed(() => history.status ?? run.value?.status ?? null);
  const running = computed(() => isRunning(status.value));
  const valid = (ticket: number) =>
    ticket === epoch && visible && allowed.value;
  function stop() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    epoch++;
  }
  function clear() {
    stop();
    sessions.value = [];
    presets.value = [];
    selected.value = null;
    run.value = null;
    pending.value = null;
    draft.value = '';
    error.value = '';
    loading.value = false;
    sending.value = false;
    cancelling.value = false;
    Object.assign(history, emptyHistory());
  }
  function failed(ticket: number) {
    if (!valid(ticket)) return;
    error.value = '无法读取会话，请刷新重试。';
    sessions.value = [];
    selected.value = null;
    run.value = null;
    Object.assign(history, emptyHistory());
    pending.value = null;
    draft.value = '';
  }
  async function read(ticket: number) {
    const sessionId = selected.value?.id;
    if (!sessionId || !valid(ticket)) return;
    const current = await getAgentSession(sessionId);
    if (!valid(ticket)) return;
    selected.value = current;
    const currentRun = current.activeRunId
      ? await getAgentRun(current.activeRunId)
      : null;
    if (!valid(ticket)) return;
    run.value = currentRun;
    if (
      currentRun &&
      presets.value.some((preset) => preset.sceneKey === currentRun.sceneKey)
    )
      sceneKey.value = currentRun.sceneKey;
    for (;;) {
      const batch = await getAgentEvents(sessionId, history.cursor);
      if (!valid(ticket)) return;
      applyEvents(history, batch);
      if (batch.length < 200) break;
    }
    if (running.value && valid(ticket)) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void poll(ticket);
      }, 1000);
    }
  }
  async function poll(ticket: number) {
    try {
      await read(ticket);
    } catch {
      failed(ticket);
    }
  }
  async function select(session: AgentSession) {
    stop();
    const ticket = epoch;
    selected.value = session;
    run.value = null;
    pending.value = null;
    draft.value = '';
    error.value = '';
    Object.assign(history, emptyHistory());
    loading.value = true;
    try {
      await read(ticket);
    } catch {
      failed(ticket);
    } finally {
      if (valid(ticket)) loading.value = false;
    }
  }
  async function refresh() {
    stop();
    const ticket = epoch;
    if (!visible || !allowed.value) return;
    loading.value = true;
    error.value = '';
    try {
      const [items, choices] = await Promise.all([
        listAgentSessions(),
        listAgentPresets(),
      ]);
      if (!valid(ticket)) return;
      sessions.value = items;
      presets.value = choices;
      if (!choices.some((item) => item.sceneKey === sceneKey.value))
        sceneKey.value = choices[0]?.sceneKey ?? '';
      selected.value =
        items.find((item) => item.id === selected.value?.id) ??
        items[0] ??
        null;
      if (pending.value && pending.value.sessionId !== selected.value?.id) {
        pending.value = null;
        draft.value = '';
      }
      run.value = null;
      Object.assign(history, emptyHistory());
      await read(ticket);
    } catch {
      failed(ticket);
    } finally {
      if (valid(ticket)) loading.value = false;
    }
  }
  async function create() {
    if (!allowed.value || loading.value || sending.value) return;
    stop();
    const ticket = epoch;
    loading.value = true;
    error.value = '';
    try {
      const item = await createAgentSession('新会话');
      if (!valid(ticket)) return;
      sessions.value = [item, ...sessions.value];
      selected.value = item;
      run.value = null;
      pending.value = null;
      draft.value = '';
      Object.assign(history, emptyHistory());
    } catch {
      if (valid(ticket)) error.value = '新建会话失败，请重试。';
    } finally {
      if (valid(ticket)) loading.value = false;
    }
  }
  async function send() {
    if (!allowed.value || sending.value || loading.value) return;
    if (!pending.value) {
      if (
        !selected.value ||
        !sceneKey.value ||
        !draft.value.trim() ||
        running.value
      )
        return;
      pending.value = {
        sessionId: selected.value.id,
        submission: {
          input: draft.value.trim(),
          sceneKey: sceneKey.value,
          clientRequestId: crypto.randomUUID(),
        },
      };
    }
    const request = pending.value;
    stop();
    const ticket = epoch;
    sending.value = true;
    error.value = '';
    try {
      const admitted = await submitAgentRun(
        request.sessionId,
        request.submission,
      );
      if (!valid(ticket)) return;
      pending.value = null;
      draft.value = '';
      run.value = admitted.run;
      // A previous terminal run must not suppress polling for this new admission.
      history.status = admitted.run.status;
      history.currentRunId = admitted.run.id;
      history.steps = [];
      history.phase = '';
      history.errorCode = null;
      if (timer) clearTimeout(timer);
      await read(ticket);
      if (valid(ticket) && selected.value)
        sessions.value = [
          selected.value,
          ...sessions.value.filter((item) => item.id !== request.sessionId),
        ];
    } catch {
      if (valid(ticket)) {
        if (pending.value)
          error.value = '提交结果尚未确认，可重试提交；不会重复创建同一任务。';
        else failed(ticket);
      }
    } finally {
      if (valid(ticket)) sending.value = false;
    }
  }
  async function cancel() {
    if (!run.value || !running.value || cancelling.value) return;
    stop();
    const ticket = epoch;
    cancelling.value = true;
    try {
      const value = await cancelAgentRun(run.value.id);
      if (!valid(ticket)) return;
      run.value = value;
      history.status = value.status;
      if (timer) clearTimeout(timer);
      await read(ticket);
    } catch {
      if (valid(ticket)) {
        failed(ticket);
        error.value = '停止结果尚未确认，请刷新查看任务状态。';
      }
    } finally {
      if (valid(ticket)) cancelling.value = false;
    }
  }
  async function rename(title: string) {
    if (!selected.value || !allowed.value) return;
    const previous = selected.value;
    const ticket = epoch;
    const updated = await renameAgentSession(
      previous.id,
      title,
      previous.version,
    );
    if (!valid(ticket)) return;
    selected.value = updated;
    sessions.value = sessions.value.map((item) =>
      item.id === updated.id ? updated : item,
    );
  }
  function activate() {
    if (visible) return;
    visible = true;
    void refresh();
  }
  onMounted(activate);
  onActivated(activate);
  onDeactivated(() => {
    visible = false;
    stop();
    loading.value = false;
    sending.value = false;
    cancelling.value = false;
    Object.assign(history, emptyHistory());
  });
  onBeforeUnmount(() => {
    visible = false;
    clear();
  });
  watch(
    () => [access.accessToken, allowed.value],
    () => {
      clear();
      if (visible && allowed.value) void refresh();
    },
  );
  return {
    allowed,
    sessions,
    presets,
    selected,
    run,
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
  };
}
