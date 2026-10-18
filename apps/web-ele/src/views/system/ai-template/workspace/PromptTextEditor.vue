<script setup lang="ts">
import type { PromptVariable } from './prompt-tokens';

import { computed, nextTick, ref, watch } from 'vue';

import { promptSegments, variableToken } from './prompt-tokens';

const props = defineProps<{
  modelValue: string;
  readonly: boolean;
  variables: PromptVariable[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const input = ref<HTMLTextAreaElement>();
const mirror = ref<HTMLPreElement>();
const value = ref(props.modelValue);
const composing = ref(false);
const segments = computed(() => promptSegments(value.value, props.variables));
interface Snapshot {
  value: string;
  start: number;
  end: number;
}
let history: Snapshot[] = [{ value: props.modelValue, start: 0, end: 0 }];
let position = 0;
let lastInput = '';
let lastTime = 0;
let updatingSelection = false;

function rememberSelection() {
  if (composing.value || updatingSelection) return;
  const current = history[position];
  if (current && input.value) {
    if (
      current.start !== input.value.selectionStart ||
      current.end !== input.value.selectionEnd
    )
      lastInput = '';
    current.start = input.value.selectionStart;
    current.end = input.value.selectionEnd;
  }
}
function startComposition() {
  rememberSelection();
  lastInput = '';
  composing.value = true;
}
function syncScroll() {
  if (input.value && mirror.value) {
    mirror.value.scrollTop = input.value.scrollTop;
    mirror.value.scrollLeft = input.value.scrollLeft;
  }
}
function commit(kind: string, group = true) {
  const element = input.value;
  if (!element) return;
  if (props.readonly) {
    element.value = value.value;
    return;
  }
  if (element.value === value.value) return;
  const now = Date.now();
  const snapshot = {
    value: element.value,
    start: element.selectionStart,
    end: element.selectionEnd,
  };
  const merge =
    group &&
    kind === 'insertText' &&
    kind === lastInput &&
    now - lastTime < 750 &&
    position > 0 &&
    position === history.length - 1;
  history = history.slice(0, position + 1);
  if (merge) history[position] = snapshot;
  else {
    history.push(snapshot);
    position++;
  }
  while (
    history.length > 2 &&
    (history.length > 100 ||
      history.reduce((size, item) => size + item.value.length, 0) > 1_048_576)
  ) {
    history.shift();
    position--;
  }
  lastInput = kind;
  lastTime = now;
  value.value = snapshot.value;
  emit('update:modelValue', snapshot.value);
  void nextTick(syncScroll);
}
function onInput(event: Event) {
  if (!composing.value && !(event as InputEvent).isComposing)
    commit((event as InputEvent).inputType ?? 'insertText');
}
function endComposition() {
  composing.value = false;
  commit('composition', false);
}
async function restore(direction: number) {
  if (props.readonly || composing.value) return;
  rememberSelection();
  const target = position + direction;
  const snapshot = history[target];
  if (!snapshot) return;
  updatingSelection = true;
  position = target;
  lastInput = '';
  value.value = snapshot.value;
  emit('update:modelValue', snapshot.value);
  await nextTick();
  input.value?.setSelectionRange(snapshot.start, snapshot.end);
  syncScroll();
  updatingSelection = false;
}
function beforeInput(event: Event) {
  if (composing.value || (event as InputEvent).isComposing) return;
  const type = (event as InputEvent).inputType;
  if (type === 'historyUndo' || type === 'historyRedo') {
    event.preventDefault();
    void restore(type === 'historyUndo' ? -1 : 1);
  } else rememberSelection();
}
function keydown(event: KeyboardEvent) {
  if (
    props.readonly ||
    composing.value ||
    event.isComposing ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey
  )
    return;
  const key = event.key.toLowerCase();
  if (key === 'z' || key === 'y') {
    event.preventDefault();
    void restore(key === 'y' || event.shiftKey ? 1 : -1);
  }
}
async function insertVariable(name: string) {
  if (props.readonly || composing.value) return;
  const variable = props.variables.find((item) => item.name === name);
  const element = input.value;
  if (!variable || !element) return;
  rememberSelection();
  const token = variableToken(variable);
  const cursor = element.selectionStart + token.length;
  updatingSelection = true;
  element.setRangeText(
    token,
    element.selectionStart,
    element.selectionEnd,
    'end',
  );
  element.setSelectionRange(cursor, cursor);
  commit('variable', false);
  await nextTick();
  element.focus();
  element.setSelectionRange(cursor, cursor);
  syncScroll();
  updatingSelection = false;
}
watch(
  () => props.modelValue,
  (next) => {
    if (next === value.value || composing.value) return;
    value.value = next;
    history = [{ value: next, start: 0, end: 0 }];
    position = 0;
    lastInput = '';
  },
);
defineExpose({ insertVariable });
</script>
<template>
  <div
    class="prompt-text-editor"
    :class="{ 'is-composing': composing, 'is-readonly': readonly }"
  >
    <pre
      ref="mirror"
      class="prompt-highlight"
      aria-hidden="true"
    ><template v-for="(segment, index) in segments" :key="index"><span :class="{ 'prompt-token': segment.variable, 'is-unknown': segment.variable && !segment.known }">{{ segment.text }}</span></template>{{ '\n' }}</pre>
    <textarea
      ref="input"
      :value="value"
      :readonly="readonly"
      class="prompt-input"
      aria-label="提示词"
      spellcheck="false"
      placeholder="描述要完成的任务，在需要业务数据的位置插入引用…"
      @beforeinput="beforeInput"
      @input="onInput"
      @compositionstart="startComposition"
      @compositionend="endComposition"
      @keydown="keydown"
      @scroll="syncScroll"
      @select="rememberSelection"
      @click="rememberSelection"
      @keyup="rememberSelection"
    ></textarea>
  </div>
</template>
<style scoped>
.prompt-text-editor {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 140px;
  overflow: hidden;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.prompt-text-editor:focus-within {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 10%);
}

.prompt-highlight,
.prompt-input {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 16px;
  margin: 0;
  overflow: auto;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.9;
  letter-spacing: normal;
  overflow-wrap: anywhere;
  tab-size: 2;
  white-space: pre-wrap;
  border: 0;
}

.prompt-highlight {
  color: hsl(var(--foreground));
  pointer-events: none;
}

.prompt-input {
  color: transparent;
  caret-color: hsl(var(--foreground));
  resize: none;
  outline: none;
  background: transparent;
}

.prompt-input::placeholder {
  color: hsl(var(--muted-foreground));
}

.prompt-input::selection {
  color: transparent;
  background: hsl(var(--primary) / 20%);
}

.prompt-token {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: 3px;
}

.prompt-token.is-unknown {
  color: var(--el-color-warning);
}

.is-composing .prompt-input {
  color: hsl(var(--foreground));
}

.is-composing .prompt-highlight {
  visibility: hidden;
}

.is-readonly {
  background: hsl(var(--muted) / 20%);
}

@media (forced-colors: active) {
  .prompt-input {
    color: CanvasText;
  }

  .prompt-highlight {
    visibility: hidden;
  }
}
</style>
