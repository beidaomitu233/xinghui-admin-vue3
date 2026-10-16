import { ElMessage, ElMessageBox } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntityDialog } from './use-entity-dialog';

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}));

function createDialog(overrides: Record<string, unknown> = {}) {
  const save = vi.fn().mockResolvedValue(undefined);
  const onSaved = vi.fn();
  const dialog = useEntityDialog({
    allowed: () => true,
    empty: () => ({ name: '' }),
    prepare: async (_mode, id) => ({ name: id ?? '' }),
    save,
    validate: async () => true,
    onSaved,
    parseError: (message) => ({
      message,
      fieldErrors: { name: message },
    }),
    ...overrides,
  });
  return { dialog, onSaved, save };
}

describe('entity dialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prevents duplicate submits while validation or save is pending', async () => {
    let releaseValidation!: (value: boolean) => void;
    const validation = new Promise<boolean>((resolve) => {
      releaseValidation = resolve;
    });
    const { dialog, save, onSaved } = createDialog({
      validate: () => validation,
    });
    await dialog.open('create');
    dialog.form.name = 'Alice';
    const first = dialog.submit();
    expect(dialog.saving.value).toBe(true);
    expect(await dialog.submit()).toBe(false);
    releaseValidation(true);
    expect(await first).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(dialog.visible.value).toBe(false);
  });

  it('keeps input and maps a server error to the field', async () => {
    const { dialog, save } = createDialog();
    save.mockRejectedValueOnce({
      message: 'Request failed with status code 200',
      response: { data: { message: '名称已存在' } },
    });
    await dialog.open('create');
    dialog.form.name = 'taken';
    expect(await dialog.submit()).toBe(false);
    expect(dialog.visible.value).toBe(true);
    expect(dialog.form.name).toBe('taken');
    expect(dialog.submitError.value).toBe('名称已存在');
    expect(dialog.fieldErrors.name).toBe('名称已存在');
    dialog.clearFieldError('name');
    expect(dialog.fieldErrors.name).toBeUndefined();
    expect(dialog.reset()).toBe(true);
    expect(dialog.form.name).toBe('');
    expect(dialog.submitError.value).toBe('');
  });

  it('asks before discarding changes and keeps a detail view read only', async () => {
    const { dialog, save } = createDialog();
    await dialog.open('edit', 'Original');
    dialog.form.name = 'Changed';
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    expect(await dialog.requestClose()).toBe(false);
    expect(dialog.visible.value).toBe(true);
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(undefined as never);
    expect(await dialog.requestClose()).toBe(true);
    expect(dialog.visible.value).toBe(false);
    await dialog.open('view', 'Detail');
    expect(await dialog.submit()).toBe(false);
    expect(dialog.reset()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
  });

  it('enforces permissions before loading or saving', async () => {
    const prepare = vi.fn().mockResolvedValue({ name: '' });
    const { dialog, save } = createDialog({
      allowed: () => false,
      prepare,
    });
    expect(await dialog.open('create')).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(await dialog.submit()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
