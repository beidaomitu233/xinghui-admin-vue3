<script lang="ts" setup>
import type { NotificationTemplate } from '#/api/system/notification-template';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

import {
  createNotificationTemplate,
  listNotificationTemplates,
  updateNotificationTemplate,
} from '#/api/system/notification-template';
import AdminPageHeader from '#/components/admin-page-header.vue';
import PageHint from '#/components/page-hint.vue';

const accessStore = useAccessStore();
const can = (permission: string) =>
  accessStore.accessCodes.includes(permission);
const templates = ref<NotificationTemplate[]>([]);
const loading = ref(false);
const failed = ref(false);
const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<number>();
const form = reactive({
  eventCode: '',
  name: '',
  titleTemplate: '',
  bodyTemplate: '',
  targetTemplate: '',
  allowedVariablesText: '',
  enabled: false,
});

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    templates.value = await listNotificationTemplates();
  } catch {
    templates.value = [];
    failed.value = true;
    ElMessage.error('加载通知模板失败');
  } finally {
    loading.value = false;
  }
}

function open(row?: NotificationTemplate) {
  editingId.value = row?.id;
  Object.assign(form, {
    eventCode: row?.eventCode ?? '',
    name: row?.name ?? '',
    titleTemplate: row?.titleTemplate ?? '',
    bodyTemplate: row?.bodyTemplate ?? '',
    targetTemplate: row?.targetTemplate ?? '',
    allowedVariablesText: row?.allowedVariables.join(', ') ?? '',
    enabled: row?.enabled ?? false,
  });
  dialogVisible.value = true;
}

async function save() {
  const allowedVariables = form.allowedVariablesText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    !form.eventCode.trim() ||
    !form.name.trim() ||
    !form.titleTemplate.trim() ||
    !form.bodyTemplate.trim()
  ) {
    ElMessage.warning('请填写事件编码、名称、标题和正文');
    return;
  }
  saving.value = true;
  const data = {
    name: form.name,
    titleTemplate: form.titleTemplate,
    bodyTemplate: form.bodyTemplate,
    targetTemplate: form.targetTemplate || null,
    allowedVariables,
    enabled: form.enabled,
  };
  try {
    await (editingId.value === undefined
      ? createNotificationTemplate({ eventCode: form.eventCode, ...data })
      : updateNotificationTemplate(editingId.value, data));
    dialogVisible.value = false;
    ElMessage.success('通知模板已保存');
    await load();
  } catch {
    // The shared request interceptor displays the server's specific validation error.
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page content-class="admin-page">
    <AdminPageHeader title="通知模板" description="管理平台事件模板">
      <template #actions>
        <el-button
          v-if="can('system:notificationTemplate:add')"
          type="primary"
          @click="open()"
        >
          新增模板
        </el-button>
      </template>
    </AdminPageHeader>
    <div class="space-y-4 p-4">
      <PageHint
        title="模板定义事件内容，投递结果请查看收件箱"
        details="模板仅定义事件内容。待投递请求不代表用户已收到通知；请勿用公告替代个人收件箱。"
      />
      <el-card>
        <el-alert
          v-if="failed"
          title="加载失败，请重试"
          type="error"
          class="mb-4"
        >
          <template #default>
            <el-button link type="primary" @click="load">重新加载</el-button>
          </template>
        </el-alert>
        <el-table v-loading="loading" :data="templates">
          <el-table-column prop="eventCode" label="事件编码" min-width="180" />
          <el-table-column prop="name" label="模板名称" min-width="130" />
          <el-table-column
            prop="titleTemplate"
            label="标题模板"
            min-width="190"
            show-overflow-tooltip
          />
          <el-table-column label="变量" min-width="160">
            <template #default="{ row }">
              {{ row.allowedVariables.join(', ') || '无' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            v-if="can('system:notificationTemplate:edit')"
            label="操作"
            width="80"
          >
            <template #default="{ row }">
              <el-button link type="primary" @click="open(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId === undefined ? '新增通知模板' : '编辑通知模板'"
      width="620px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="事件编码">
          <el-input
            v-model="form.eventCode"
            :disabled="editingId !== undefined"
            maxlength="100"
            placeholder="例如 sample_a.record_created"
          />
        </el-form-item>
        <el-form-item label="模板名称">
          <el-input v-model="form.name" maxlength="100" />
        </el-form-item>
        <el-form-item label="标题模板">
          <el-input
            v-model="form.titleTemplate"
            maxlength="200"
            placeholder="可用 {name} 引用已声明变量"
          />
        </el-form-item>
        <el-form-item label="正文模板">
          <el-input
            v-model="form.bodyTemplate"
            type="textarea"
            :rows="5"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="允许变量">
          <el-input
            v-model="form.allowedVariablesText"
            placeholder="逗号分隔，例如 name, recordId"
          />
        </el-form-item>
        <el-form-item label="目标路径">
          <el-input
            v-model="form.targetTemplate"
            maxlength="512"
            placeholder="站内 /records/{recordId}；外链须在服务端配置允许域名"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          保存
        </el-button>
      </template>
    </el-dialog>
  </Page>
</template>
