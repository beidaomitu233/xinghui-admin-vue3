import { ref } from 'vue';

import { ElMessage, ElMessageBox } from 'element-plus';

export function useConfirmedAction() {
  const busy = ref(false);

  async function run(options: {
    action: () => Promise<unknown>;
    allowed: boolean;
    message: string;
    onSuccess?: () => Promise<unknown> | unknown;
    successMessage: string;
  }) {
    if (busy.value || !options.allowed) return false;
    busy.value = true;
    try {
      await ElMessageBox.confirm(options.message, '请确认', {
        cancelButtonText: '取消',
        confirmButtonText: '确定',
        type: 'warning',
      });
    } catch {
      busy.value = false;
      return false;
    }

    try {
      await options.action();
      ElMessage.success(options.successMessage);
      await options.onSuccess?.();
      return true;
    } catch {
      ElMessage.error('操作失败，请重试');
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { busy, run };
}
