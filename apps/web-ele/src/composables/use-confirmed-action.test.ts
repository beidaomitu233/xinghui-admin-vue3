import { ElMessage, ElMessageBox } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConfirmedAction } from './use-confirmed-action';

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}));

describe('confirmed list action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not call the API when permission is missing or user cancels', async () => {
    const action = vi.fn();
    const { run } = useConfirmedAction();
    expect(
      await run({
        action,
        allowed: false,
        message: 'Delete?',
        successMessage: 'Done',
      }),
    ).toBe(false);
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    expect(
      await run({
        action,
        allowed: true,
        message: 'Delete?',
        successMessage: 'Done',
      }),
    ).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('reports failed requests without claiming success', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValueOnce(undefined as never);
    const { run } = useConfirmedAction();
    const result = await run({
      action: vi.fn().mockRejectedValue(new Error('offline')),
      allowed: true,
      message: 'Delete?',
      successMessage: 'Done',
    });
    expect(result).toBe(false);
    expect(ElMessage.error).toHaveBeenCalled();
    expect(ElMessage.success).not.toHaveBeenCalled();
  });
});
