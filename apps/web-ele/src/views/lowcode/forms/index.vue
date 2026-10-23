<script setup lang="ts">
import type { FormDefinition, Page as FormPage } from '#/api/lowcode/forms';

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  getForm,
  listForms,
  publishForm,
  removeForm,
  updateForm,
} from '#/api/lowcode/forms';
import AdminPageHeader from '#/components/admin-page-header.vue';

import FormDesigner from './FormDesigner.vue';
import FormSharing from './FormSharing.vue';

const access = useAccessStore();
const router = useRouter();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:form:${action}`);
const recordCan = (action: string) =>
  access.accessCodes.includes(`lowcode:record:${action}`);
const result = ref<FormPage<FormDefinition>>({
  records: [],
  total: '0',
  pageNum: 1,
  pageSize: 10,
});
const editor = ref(false);
const sharingOpened = ref(false);
const sharingForm = ref<FormDefinition>();
function openSharing(form: FormDefinition) {
  sharingForm.value = form;
  sharingOpened.value = true;
}
const failed = ref(false);
const loading = ref(false);
const name = ref('');
const pageNum = ref(1);
const pageSize = ref(10);
const readOnly = ref(false);
const source = ref<FormDefinition>();
let serial = 0;
onBeforeUnmount(() => {
  serial++;
});
async function load() {
  if (!can('list')) return;
  const run = ++serial;
  loading.value = true;
  failed.value = false;
  try {
    const data = await listForms({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      name: name.value,
    });
    if (run === serial) result.value = data;
  } catch {
    if (run === serial) {
      failed.value = true;
      result.value.records = [];
    }
  } finally {
    if (run === serial) loading.value = false;
  }
}
function search() {
  pageNum.value = 1;
  void load();
}
async function open(row?: FormDefinition, view = false) {
  if (row) {
    try {
      source.value = await getForm(row.id);
    } catch {
      return;
    }
  } else source.value = undefined;
  readOnly.value = view;
  editor.value = true;
}
async function action(
  row: FormDefinition,
  type: 'disable' | 'publish' | 'remove',
) {
  try {
    const messages = {
      remove: '删除空表单后无法恢复，是否继续？',
      disable: '停用后不能新增记录，历史数据仍可管理，是否继续？',
      publish: '将发布已保存的草稿，是否继续？',
    };
    await ElMessageBox.confirm(messages[type], '操作确认');
  } catch {
    return;
  }
  try {
    if (type === 'remove') await removeForm(row.id, row.revision);
    else if (type === 'publish') await publishForm(row.id, row.revision);
    else {
      const draft = await getForm(row.id);
      await updateForm(row.id, {
        ...draft,
        status: 'disabled',
        revision: row.revision,
      });
    }
    ElMessage.success('操作成功');
    await load();
  } catch {
    /* Shared interceptor reports the error. */
  }
}
onMounted(() => void load());
</script>
<template>
  <!-- Prettier formats adjacent inline controls; avoid conflicting whitespace rules. -->
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/html-closing-bracket-newline -->
  <Page content-class="admin-page">
    <AdminPageHeader title="表单管理">
      <template #actions>
        <el-button v-if="can('add')" type="primary" @click="open()">
          新增表单
        </el-button>
      </template>
    </AdminPageHeader>
    <el-card>
      <el-alert
        v-if="!can('list')"
        title="没有表单设计列表权限"
        type="warning"
        closable
      />
      <template v-else>
        <el-form inline @submit.prevent="search">
          <el-form-item label="名称">
            <el-input
              v-model="name"
              maxlength="100"
              placeholder="搜索表单名称"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="search">
              查询
            </el-button>
          </el-form-item>
        </el-form>
        <el-alert v-if="failed" title="表单加载失败" type="error" closable>
          <el-button @click="load">重试</el-button>
        </el-alert>
        <el-table
          v-loading="loading"
          :data="result.records"
          row-key="id"
          border
          empty-text="暂无表单，可通过新增创建"
        >
          <el-table-column prop="name" label="名称" min-width="180" />
          <el-table-column prop="formKey" label="标识" min-width="160" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              {{
                row.status === 'draft'
                  ? '草稿'
                  : row.status === 'enabled'
                    ? '已发布'
                    : '已停用'
              }}
            </template>
          </el-table-column>
          <el-table-column
            prop="publishedVersion"
            label="发布版本"
            width="100"
          />
          <el-table-column prop="revision" label="修订" width="80" />
          <el-table-column label="操作" min-width="480">
            <template #default="{ row }">
              <el-button v-if="can('query')" link @click="open(row, true)">
                详情
              </el-button>
              <el-button
                v-if="can('query') && can('edit')"
                link
                type="primary"
                @click="open(row)"
              >
                设计
              </el-button>
              <el-button
                v-if="can('publish')"
                link
                @click="action(row, 'publish')"
              >
                发布
              </el-button>
              <el-button v-if="can('publish')" link @click="openSharing(row)">
                分享填写
              </el-button>
              <el-button
                v-if="row.status === 'enabled' && can('edit') && can('query')"
                link
                @click="action(row, 'disable')"
              >
                停用
              </el-button>
              <el-button
                v-if="
                  row.publishedVersion &&
                  recordCan('add') &&
                  row.status === 'enabled'
                "
                link
                type="primary"
                @click="router.push(`/lowcode/runtime/${row.id}`)"
              >
                填写
              </el-button>
              <el-button
                v-if="row.publishedVersion && recordCan('list')"
                link
                type="primary"
                @click="router.push(`/lowcode/records/${row.id}`)"
              >
                数据
              </el-button>
              <el-button
                v-if="can('remove')"
                link
                type="danger"
                @click="action(row, 'remove')"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          class="mt-4"
          v-model:current-page="pageNum"
          v-model:page-size="pageSize"
          :total="Number(result.total)"
          :page-sizes="[10, 20, 50, 100]"
          layout="total,sizes,prev,pager,next"
          @current-change="load"
          @size-change="search"
        />
      </template>
    </el-card>
    <FormDesigner
      v-model="editor"
      :source="source"
      :read-only="readOnly"
      @saved="load"
    />
    <FormSharing v-model="sharingOpened" :form="sharingForm" />
  </Page>
</template>
