<script setup lang="ts">
import { ElMessageBox } from 'element-plus';

import { resetDemoData } from './transport';

async function reset() {
  try {
    await ElMessageBox.confirm(
      '删除本演示的本地修改并恢复虚构示例？不会清理其他站点数据。',
      '重置示例数据',
    );
  } catch {
    return;
  }
  resetDemoData(window.localStorage);
  window.location.reload();
}
</script>
<template>
  <el-alert
    class="demo-notice"
    title="演示模式：数据仅保存在本浏览器，请勿输入真实密钥。"
    type="info"
    closable
  >
    <span>字典、表单及资讯可本地编辑；账号、权限、文件和外部服务只读。</span>
    <button type="button" class="ml-2 underline" @click="reset">
      重置示例数据
    </button>
  </el-alert>
</template>
<style scoped>
.demo-notice {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 3000;
  width: min(720px, calc(100vw - 24px));
}
</style>
