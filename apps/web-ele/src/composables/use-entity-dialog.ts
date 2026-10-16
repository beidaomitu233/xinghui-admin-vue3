import { computed, reactive, ref, toRaw } from 'vue';

import { ElMessage, ElMessageBox } from 'element-plus';

export type EntityDialogMode = 'create' | 'edit' | 'view';

interface SubmitError {
  fieldErrors?: Record<string, string>;
  message: string;
}

function copy<Form>(value: Form): Form {
  return structuredClone(value);
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  const seen = new Set<unknown>();
  const candidates: unknown[] = [error];
  while (candidates.length > 0) {
    const candidate = candidates.shift();
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    const record = candidate as Record<string, unknown>;
    if ('data' in record) candidates.unshift(record.data);
    if ('response' in record) candidates.unshift(record.response);
    for (const key of ['msg', 'message'] as const) {
      if (typeof record[key] === 'string') {
        const message = record[key].trim();
        if (message && !/^Request failed with status code \d+$/.test(message)) {
          return message;
        }
      }
    }
  }
  return '保存失败，请重试';
}

export function useEntityDialog<Form extends object>(options: {
  allowed: (mode: EntityDialogMode) => boolean;
  empty: () => Form;
  onSaved: () => Promise<unknown> | unknown;
  parseError?: (message: string, error: unknown) => SubmitError;
  prepare: (mode: EntityDialogMode, id?: string) => Promise<Form>;
  save: (mode: 'create' | 'edit', value: Form) => Promise<unknown>;
  validate: () => Promise<boolean>;
}) {
  const form = reactive(options.empty()) as Form;
  const visible = ref(false);
  const mode = ref<EntityDialogMode>('create');
  const loading = ref(false);
  const saving = ref(false);
  const submitError = ref('');
  const fieldErrors = reactive<Record<string, string>>({});
  let baseline = copy(options.empty());
  let openRequest = 0;

  const dirty = computed(
    () =>
      mode.value !== 'view' &&
      JSON.stringify(form) !== JSON.stringify(baseline),
  );

  function clearErrors() {
    submitError.value = '';
    for (const key of Object.keys(fieldErrors))
      Reflect.deleteProperty(fieldErrors, key);
  }

  function replaceForm(value: Form) {
    const target = form as Record<string, unknown>;
    for (const key of Object.keys(target)) Reflect.deleteProperty(target, key);
    Object.assign(target, copy(value));
  }

  async function open(nextMode: EntityDialogMode, id?: string) {
    if (!options.allowed(nextMode) || loading.value || saving.value) {
      return false;
    }
    const request = ++openRequest;
    loading.value = true;
    clearErrors();
    try {
      const prepared = await options.prepare(nextMode, id);
      if (request !== openRequest) return false;
      replaceForm(prepared);
      baseline = copy(prepared);
      mode.value = nextMode;
      visible.value = true;
      return true;
    } catch {
      ElMessage.error('表单数据加载失败，请重试');
      return false;
    } finally {
      if (request === openRequest) loading.value = false;
    }
  }

  function reset() {
    if (saving.value || mode.value === 'view') return false;
    replaceForm(baseline);
    clearErrors();
    return true;
  }

  async function submit() {
    const currentMode = mode.value;
    if (
      !visible.value ||
      saving.value ||
      currentMode === 'view' ||
      !options.allowed(currentMode)
    ) {
      return false;
    }
    saving.value = true;
    clearErrors();
    try {
      if (!(await options.validate())) return false;
      await options.save(currentMode, copy(toRaw(form)));
    } catch (error) {
      const message = errorMessage(error);
      const parsed = options.parseError?.(message, error) ?? { message };
      submitError.value = parsed.message;
      Object.assign(fieldErrors, parsed.fieldErrors ?? {});
      return false;
    } finally {
      saving.value = false;
    }
    baseline = copy(toRaw(form));
    visible.value = false;
    ElMessage.success('保存成功');
    try {
      await options.onSaved();
    } catch {
      ElMessage.error('保存成功，列表刷新失败，请手动刷新');
    }
    return true;
  }

  async function canClose() {
    if (saving.value || loading.value) return false;
    if (!dirty.value) return true;
    try {
      await ElMessageBox.confirm(
        '当前修改尚未保存，确定放弃吗？',
        '未保存的修改',
        {
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
          type: 'warning',
        },
      );
      return true;
    } catch {
      return false;
    }
  }

  async function requestClose() {
    if (!(await canClose())) return false;
    visible.value = false;
    return true;
  }

  async function beforeClose(done: () => void) {
    if (await canClose()) done();
  }

  function clearFieldError(field: string) {
    Reflect.deleteProperty(fieldErrors, field);
  }

  return {
    beforeClose,
    clearFieldError,
    dirty,
    fieldErrors,
    form,
    loading,
    mode,
    open,
    requestClose,
    reset,
    saving,
    submit,
    submitError,
    visible,
  };
}
