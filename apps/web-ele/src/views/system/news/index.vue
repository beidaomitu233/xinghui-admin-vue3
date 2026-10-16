<script setup lang="ts">
import type { NewsChange, NewsPage, NewsRecord } from '#/api/system/news';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  createNews,
  getNews,
  listNews,
  removeNews,
  updateNews,
} from '#/api/system/news';

import { safeContentUrl } from '../content-validation';

const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`system:news:${action}`);
const page = ref<NewsPage>({ records: [], total: 0, pageNum: 1, pageSize: 10 });
const query = reactive({ pageNum: 1, pageSize: 10, title: '', status: '' });
const loading = ref(false);
const failed = ref(false);
const saving = ref(false);
const dialog = ref(false);
const editingId = ref<string>();
const detail = ref<NewsRecord>();
const detailDialog = ref(false);
const newForm = (): NewsChange => ({
  title: '',
  summary: '',
  content: '',
  coverImage: '',
  category: 'general',
  tags: '[]',
  status: '1',
});
const form = reactive<NewsChange>(newForm());
const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: '标题' },
  { key: 'summary', label: '摘要' },
  { key: 'content', label: '正文' },
  { key: 'coverImage', label: '封面地址' },
  { key: 'category', label: '分类' },
  { key: 'tags', label: '标签JSON' },
  { key: 'viewCount', label: '浏览量' },
  { key: 'publishTime', label: '发布时间' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间' },
  { key: 'updateTime', label: '更新时间' },
];
function detailValue(key: string) {
  const value = detail.value?.[key];
  if (value === null || value === undefined || value === '') return '-';
  if (key === 'status') {
    if (value === '0') return '发布';
    return value === '1' ? '草稿' : '下架';
  }
  return String(value);
}
let loadSerial = 0;

async function load() {
  if (!can('list')) return;
  const request = ++loadSerial;
  loading.value = true;
  failed.value = false;
  try {
    const result = await listNews({ ...query });
    if (request === loadSerial) page.value = result;
  } catch {
    if (request === loadSerial) {
      failed.value = true;
      page.value = { ...page.value, records: [], total: 0 };
    }
  } finally {
    if (request === loadSerial) loading.value = false;
  }
}
function search() {
  query.pageNum = 1;
  void load();
}
function resetSearch() {
  query.title = '';
  query.status = '';
  search();
}
function openCreate() {
  editingId.value = undefined;
  Object.assign(form, newForm());
  dialog.value = true;
}
async function openEdit(row: NewsRecord) {
  try {
    const current = can('query') ? await getNews(row.id) : row;
    editingId.value = current.id;
    Object.assign(form, newForm());
    form.status = String(current.status ?? newForm().status);
    form.title = String(current.title ?? '');
    form.summary = String(current.summary ?? '');
    form.content = String(current.content ?? '');
    form.coverImage = String(current.coverImage ?? '');
    form.category = String(current.category ?? '');
    form.tags = String(current.tags ?? '');
    dialog.value = true;
  } catch {
    // The shared interceptor displays the service failure; the current list stays visible.
  }
}
async function showDetail(row: NewsRecord) {
  try {
    detail.value = await getNews(row.id);
    detailDialog.value = true;
  } catch {
    // Details are opened only after a successful response.
  }
}
async function save() {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题');
    return;
  }
  if (form.status === '0' && !form.content.trim()) {
    ElMessage.warning('发布资讯需要正文');
    return;
  }
  if (!safeContentUrl(form.coverImage, true)) {
    ElMessage.warning('封面地址仅允许http/https或站内地址');
    return;
  }
  try {
    const tags: unknown = JSON.parse(form.tags || '[]');
    if (
      !Array.isArray(tags) ||
      tags.length > 20 ||
      tags.some((tag) => typeof tag !== 'string' || tag.length > 50)
    )
      throw new Error('tags');
  } catch {
    ElMessage.warning('标签需为最多20项的JSON字符串数组');
    return;
  }
  saving.value = true;
  try {
    const payload: NewsChange = { ...form };
    await (editingId.value
      ? updateNews(editingId.value, payload)
      : createNews(payload));
    ElMessage.success('保存成功');
    dialog.value = false;
    await load();
  } catch {
    // Keep the complete form open when validation, authorization or storage fails.
  } finally {
    saving.value = false;
  }
}
async function remove(row: NewsRecord) {
  try {
    await ElMessageBox.confirm(
      '确定删除该内容记录？删除后无法恢复。',
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await removeNews(row.id);
    if (page.value.records.length === 1 && query.pageNum > 1)
      query.pageNum -= 1;
    ElMessage.success('删除成功');
    await load();
  } catch {
    // Keep the current row until the server confirms deletion.
  }
}
onMounted(load);
</script>

<template>
  <Page title="资讯管理" description="维护资讯正文、分类和发布状态">
    <div class="space-y-4 p-4">
      <el-card>
        <template #header>
          <div class="flex items-center justify-between">
            <span>资讯管理列表</span>
            <el-button v-if="can('add')" type="primary" @click="openCreate">
              新增
            </el-button>
          </div>
        </template>
        <el-form inline @submit.prevent="search">
          <el-form-item label="标题">
            <el-input
              v-model="query.title"
              clearable
              maxlength="100"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select
              v-model="query.status"
              clearable
              placeholder="全部"
              style="width: 140px"
            >
              <el-option label="发布" value="0" />
              <el-option label="草稿" value="1" />
              <el-option label="下架" value="2" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="search">查询</el-button>
            <el-button @click="resetSearch">重置</el-button>
            <el-button :loading="loading" @click="load">刷新</el-button>
          </el-form-item>
        </el-form>
        <el-alert
          v-if="failed"
          title="加载失败，请检查服务或权限后重试"
          type="error"
          closable
        >
          <el-button link type="primary" @click="load">重新加载</el-button>
        </el-alert>
        <el-empty v-if="!can('list')" description="无查看权限" />
        <el-empty
          v-else-if="!loading && !failed && page.total === 0"
          description="暂无内容，可新增记录"
        />
        <el-table v-else v-loading="loading" :data="page.records" row-key="id">
          <el-table-column
            prop="title"
            label="标题"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="category"
            label="分类"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="viewCount"
            label="浏览量"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="publishTime"
            label="发布时间"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              {{ row.status === '0' ? '发布' : ''
              }}{{ row.status === '1' ? '草稿' : ''
              }}{{ row.status === '2' ? '下架' : '' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="can('query')"
                link
                type="primary"
                @click="showDetail(row)"
              >
                详情
              </el-button>
              <el-button
                v-if="can('edit')"
                link
                type="primary"
                @click="openEdit(row)"
              >
                编辑
              </el-button>
              <el-button
                v-if="can('remove')"
                link
                type="danger"
                @click="remove(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="can('list') && !failed"
          v-model:current-page="query.pageNum"
          v-model:page-size="query.pageSize"
          :total="page.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          class="mt-4"
          @current-change="load"
          @size-change="search"
        />
      </el-card>
      <el-dialog
        v-model="dialog"
        :title="editingId ? '编辑资讯管理' : '新增资讯管理'"
        width="min(760px, 94vw)"
        :close-on-click-modal="!saving"
        :close-on-press-escape="!saving"
        :show-close="!saving"
      >
        <el-alert
          title='正文按文本或Markdown编辑，详情仅转义展示；发布时间和浏览量由服务器维护。标签填写JSON字符串数组，如["产品","公告"]。'
          type="info"
          closable
          class="mb-4"
        />
        <el-form label-width="110px" @submit.prevent="save">
          <el-form-item label="标题">
            <el-input v-model="form.title" maxlength="255" show-word-limit />
          </el-form-item>
          <el-form-item label="摘要">
            <el-input
              v-model="form.summary"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="正文">
            <el-input
              v-model="form.content"
              type="textarea"
              :rows="8"
              maxlength="100000"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="封面地址">
            <el-input
              v-model="form.coverImage"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="分类">
            <el-input v-model="form.category" maxlength="50" show-word-limit />
          </el-form-item>
          <el-form-item label="标签JSON">
            <el-input
              v-model="form.tags"
              type="textarea"
              :rows="2"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status" style="width: 180px">
              <el-option label="发布" value="0" />
              <el-option label="草稿" value="1" />
              <el-option label="下架" value="2" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button :disabled="saving" @click="dialog = false">取消</el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!can(editingId ? 'edit' : 'add')"
            @click="save"
          >
            保存
          </el-button>
        </template>
      </el-dialog>
      <el-dialog
        v-model="detailDialog"
        title="资讯管理详情"
        width="min(760px, 94vw)"
      >
        <el-descriptions v-if="detail" :column="1" border>
          <el-descriptions-item
            v-for="field in detailFields"
            :key="field.key"
            :label="field.label"
          >
            <pre class="whitespace-pre-wrap break-words">{{
              detailValue(field.key)
            }}</pre>
          </el-descriptions-item>
        </el-descriptions>
      </el-dialog>
    </div>
  </Page>
</template>
