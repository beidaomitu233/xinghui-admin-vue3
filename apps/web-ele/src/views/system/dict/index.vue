<script lang="ts" setup>
import type { DictItem, DictType } from '#/api/system/dict';

import { computed, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import { listDictItems, listDictTypes } from '#/api/system/dict';

import DictionaryModal from './dictionary-modal.vue';
import { sortDictionaryRows } from './dictionary-order';

const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const canQuery = computed(() => can('system:dict:list'));
const types = ref<DictType[]>([]);
const selectedId = ref<DictType['id']>();
const selectedType = computed(() => types.value.find((row) => String(row.id) === String(selectedId.value)));
const typeError = ref('');
const itemError = ref('');
let preferredId: DictType['id'] | undefined;
let typeRevision = 0;
let itemRevision = 0;
const queryTypes: () => Promise<{ items: DictType[]; total: number }> = createVbenGridQuery(
  () => typesApi,
  async () => {
    if (!canQuery.value) return { items: [], total: 0 };
    const items = sortDictionaryRows(await listDictTypes(), 'code');
    return { items, total: items.length };
  },
  () => JSON.stringify([access.accessToken, canQuery.value, typeRevision]),
);
const [TypesGrid, typesApi] = useVbenVxeGrid<DictType>({
  tableTitle: '字典类型',
  gridOptions: {
    height: 'auto',
    minHeight: 360,
    rowConfig: { keyField: 'id' },
    pagerConfig: { enabled: false },
    columns: [
      { field: 'name', title: '名称', minWidth: 150, sortable: true, slots: { default: 'name' } },
      { field: 'code', title: '编码', minWidth: 150, sortable: true },
      { field: 'enabled', title: '状态', width: 90, sortable: true, slots: { default: 'enabled' } },
      { title: '操作', width: 85, slots: { default: 'actions' } },
    ],
    toolbarConfig: { refresh: true, custom: true },
    sortConfig: { remote: false, multiple: false, defaultSort: { field: 'code', order: 'asc' }, sortMethod: ({ data, sortList }: { data: DictType[]; sortList: { field: string; order: 'asc' | 'desc' }[] }) => sortDictionaryRows(data, sortList[0]?.field ?? 'code', sortList[0]?.order) },
    proxyConfig: { ajax: {
      query: queryTypes,
      querySuccess: ({ response }: { response: { items: DictType[] } }) => {
        typeError.value = ''; types.value = response.items;
        const target = preferredId ?? selectedId.value;
        selectedId.value = response.items.find((row) => String(row.id) === String(target))?.id ?? response.items[0]?.id;
        preferredId = undefined;
      },
      queryError: () => { typeError.value = '字典类型加载失败，请重试'; types.value = []; selectedId.value = undefined; void typesApi.grid.loadData([]); },
    } },
  },
});
const queryItems: () => Promise<{ items: DictItem[]; total: number }> = createVbenGridQuery(
  () => itemsApi,
  async () => {
    const typeId = selectedId.value;
    if (!canQuery.value || typeId === undefined) return { items: [], total: 0 };
    const items = sortDictionaryRows(await listDictItems(typeId), 'sortOrder');
    return { items, total: items.length };
  },
  () => JSON.stringify([access.accessToken, canQuery.value, selectedId.value, itemRevision]),
);
const [ItemsGrid, itemsApi] = useVbenVxeGrid<DictItem>({
  tableTitle: '字典条目',
  gridOptions: {
    height: 'auto',
    minHeight: 360,
    rowConfig: { keyField: 'id' },
    pagerConfig: { enabled: false },
    columns: [
      { field: 'value', title: '稳定值', minWidth: 130, sortable: true },
      { field: 'label', title: '显示名', minWidth: 150, sortable: true },
      { field: 'sortOrder', title: '排序', width: 85, sortable: true },
      { field: 'enabled', title: '状态', width: 90, sortable: true, slots: { default: 'enabled' } },
      { field: 'remark', title: '备注', minWidth: 160, sortable: true },
      { title: '操作', width: 85, slots: { default: 'actions' } },
    ],
    toolbarConfig: { refresh: true, custom: true },
    sortConfig: { remote: false, multiple: false, defaultSort: { field: 'sortOrder', order: 'asc' }, sortMethod: ({ data, sortList }: { data: DictItem[]; sortList: { field: string; order: 'asc' | 'desc' }[] }) => sortDictionaryRows(data, sortList[0]?.field ?? 'sortOrder', sortList[0]?.order) },
    proxyConfig: { ajax: { query: queryItems, querySuccess: () => { itemError.value = ''; }, queryError: () => { itemError.value = '字典条目加载失败，请重试'; void itemsApi.grid.loadData([]); } } },
  },
});
const [EditModal, modalApi] = useVbenModal({ connectedComponent: DictionaryModal });
function selectType(row: DictType) { selectedId.value = row.id; }
function openType(row?: DictType) {
  if (can(`system:dict:type:${row ? 'edit' : 'add'}`)) modalApi.setData({ kind: 'type', row }).open();
}
function openItem(row?: DictItem) {
  if (!selectedType.value || !can(`system:dict:item:${row ? 'edit' : 'add'}`)) return;
  if (row && String(row.typeId) !== String(selectedId.value)) return;
  modalApi.setData({ kind: 'item', row, typeId: selectedType.value.id, typeName: selectedType.value.name }).open();
}
async function loadTypes(id?: DictType['id']) {
  preferredId = id; typeRevision += 1; itemRevision += 1;
  await typesApi.query(); await itemsApi.query();
}
async function loadItems() { itemRevision += 1; await itemsApi.query(); }
watch(selectedId, async () => {
  if (!itemsApi.grid.loadData) return;
  await itemsApi.grid.loadData([]); await itemsApi.query();
});
watch([() => access.accessToken, canQuery], async () => {
  preferredId = undefined; types.value = []; selectedId.value = undefined;
  if (typesApi.grid.loadData) await typesApi.grid.loadData([]);
  if (itemsApi.grid.loadData) await itemsApi.grid.loadData([]);
  await loadTypes();
});
</script>

<template>
  <Page title="字典管理" description="维护稳定编码和显示名称；停用后历史记录仍可显示原名称" auto-content-height content-class="flex min-h-0 flex-col">
    <el-alert title="类型编码和条目值创建后不可修改" type="info" show-icon :closable="false" class="mb-4" />
    <el-alert v-if="typeError" :title="typeError" type="error" show-icon class="mb-4"><el-button link @click="loadTypes()">重试</el-button></el-alert>
    <el-alert v-if="itemError" :title="itemError" type="error" show-icon class="mb-4"><el-button link @click="loadItems">重试</el-button></el-alert>
    <div class="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2">
      <TypesGrid class="min-h-[360px] min-w-0">
        <template #toolbar-actions><el-button v-if="can('system:dict:type:add')" type="primary" @click="openType()">新增类型</el-button></template>
        <template #name="{ row }"><el-button link :type="String(selectedId) === String(row.id) ? 'primary' : undefined" @click="selectType(row)">{{ row.name }}</el-button></template>
        <template #enabled="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
        <template #actions="{ row }"><el-button v-if="can('system:dict:type:edit')" link type="primary" @click="openType(row)">编辑</el-button></template>
        <template #empty><el-empty :description="canQuery ? '暂无字典类型' : '无字典查看权限'" /></template>
      </TypesGrid>
      <ItemsGrid :table-title="selectedType ? `${selectedType.name} · 条目` : '选择字典类型'" class="min-h-[360px] min-w-0">
        <template #toolbar-actions><el-button v-if="can('system:dict:item:add')" type="primary" :disabled="selectedId === undefined" @click="openItem()">新增条目</el-button></template>
        <template #enabled="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
        <template #actions="{ row }"><el-button v-if="can('system:dict:item:edit')" link type="primary" @click="openItem(row)">编辑</el-button></template>
        <template #empty><el-empty :description="selectedId === undefined ? '请选择字典类型' : '暂无字典条目'" /></template>
      </ItemsGrid>
    </div>
    <EditModal @saved="loadTypes" />
  </Page>
</template>
