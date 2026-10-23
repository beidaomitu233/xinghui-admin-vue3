<script lang="ts" setup>
import type { DictItem, DictType } from '#/api/system/dict';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

import {
  createDictItem,
  createDictType,
  listDictItems,
  listDictTypes,
  updateDictItem,
  updateDictType,
} from '#/api/system/dict';
import AdminPageHeader from '#/components/admin-page-header.vue';
import PageHint from '#/components/page-hint.vue';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const types = ref<DictType[]>([]);
const items = ref<DictItem[]>([]);
const selectedId = ref<number>();
const selectedType = computed(() =>
  types.value.find((item) => item.id === selectedId.value),
);
const loadingTypes = ref(false);
const loadingItems = ref(false);

const typeDialog = ref(false);
const itemDialog = ref(false);
const saving = ref(false);
const editingTypeId = ref<number>();
const editingItemId = ref<number>();
const typeForm = reactive({ code: '', name: '', enabled: true, remark: '' });
const itemForm = reactive({
  value: '',
  label: '',
  sortOrder: 0,
  enabled: true,
  remark: '',
});

async function loadTypes(preferredId?: number) {
  loadingTypes.value = true;
  try {
    types.value = await listDictTypes();
    selectedId.value = preferredId ?? selectedId.value;
    if (!types.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = types.value[0]?.id;
    }
    await loadItems();
  } catch {
    ElMessage.error('加载字典类型失败');
  } finally {
    loadingTypes.value = false;
  }
}

async function loadItems() {
  if (selectedId.value === undefined) {
    items.value = [];
    return;
  }
  loadingItems.value = true;
  try {
    items.value = await listDictItems(selectedId.value);
  } catch {
    ElMessage.error('加载字典条目失败');
  } finally {
    loadingItems.value = false;
  }
}

function selectType(row: DictType) {
  selectedId.value = row.id;
  loadItems();
}

function openType(row?: DictType) {
  editingTypeId.value = row?.id;
  Object.assign(typeForm, {
    code: row?.code ?? '',
    name: row?.name ?? '',
    enabled: row?.enabled ?? true,
    remark: row?.remark ?? '',
  });
  typeDialog.value = true;
}

function openItem(row?: DictItem) {
  editingItemId.value = row?.id;
  Object.assign(itemForm, {
    value: row?.value ?? '',
    label: row?.label ?? '',
    sortOrder: row?.sortOrder ?? 0,
    enabled: row?.enabled ?? true,
    remark: row?.remark ?? '',
  });
  itemDialog.value = true;
}

async function saveType() {
  if (!typeForm.code.trim() || !typeForm.name.trim()) {
    ElMessage.warning('请填写类型编码和名称');
    return;
  }
  saving.value = true;
  try {
    const id = editingTypeId.value;
    if (id === undefined) {
      const newId = await createDictType(typeForm);
      await loadTypes(newId);
    } else {
      await updateDictType(id, typeForm);
      await loadTypes(id);
    }
    typeDialog.value = false;
    ElMessage.success('字典类型已保存');
  } catch {
    ElMessage.error('保存字典类型失败');
  } finally {
    saving.value = false;
  }
}

async function saveItem() {
  if (
    !itemForm.value.trim() ||
    !itemForm.label.trim() ||
    selectedId.value === undefined
  ) {
    ElMessage.warning('请填写条目值和显示名');
    return;
  }
  saving.value = true;
  try {
    const id = editingItemId.value;
    await (id === undefined
      ? createDictItem(selectedId.value, itemForm)
      : updateDictItem(id, itemForm));
    await loadTypes(selectedId.value);
    itemDialog.value = false;
    ElMessage.success('字典条目已保存');
  } catch {
    ElMessage.error('保存字典条目失败');
  } finally {
    saving.value = false;
  }
}

onMounted(() => loadTypes());
</script>

<template>
  <Page content-class="admin-page">
    <AdminPageHeader title="字典管理">
      <template #actions>
        <el-button
          v-if="can('system:dict:type:add')"
          type="primary"
          @click="openType()"
        >
          新增类型
        </el-button>
      </template>
    </AdminPageHeader>
    <div
      class="grid min-w-0 gap-4 xl:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]"
    >
      <el-card>
        <template #header>
          <div class="flex items-center justify-between">
            <span>字典类型</span>
          </div>
        </template>
        <div v-loading="loadingTypes" class="space-y-2">
          <button
            v-for="type in types"
            :key="type.id"
            type="button"
            class="flex w-full items-center justify-between rounded border px-3 py-2 text-left"
            :class="
              selectedId === type.id
                ? 'border-primary bg-primary/5'
                : 'border-border'
            "
            @click="selectType(type)"
          >
            <span class="min-w-0">
              <span class="block truncate font-medium">{{ type.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {{ type.code }}
              </span>
            </span>
            <span class="ml-2 flex shrink-0 items-center gap-1">
              <el-tag :type="type.enabled ? 'success' : 'info'" size="small">
                {{ type.enabled ? '启用' : '停用' }}
              </el-tag>
              <el-button
                v-if="can('system:dict:type:edit')"
                link
                type="primary"
                @click.stop="openType(type)"
              >
                编辑
              </el-button>
            </span>
          </button>
          <el-empty
            v-if="types.length === 0 && !loadingTypes"
            description="暂无字典类型"
          />
        </div>
      </el-card>

      <el-card>
        <template #header>
          <div class="flex items-center justify-between">
            <span>{{ selectedType?.name ?? '选择字典类型' }} · 条目</span>
            <el-button
              v-if="can('system:dict:item:add')"
              type="primary"
              :disabled="selectedId === undefined"
              @click="openItem()"
            >
              新增条目
            </el-button>
          </div>
        </template>
        <PageHint
          title="编码和值创建后不可修改"
          details="停用条目不再提供给新表单，历史记录仍可显示原名称。"
        />
        <el-table :data="items" v-loading="loadingItems">
          <el-table-column prop="value" label="稳定值" min-width="100" />
          <el-table-column prop="label" label="显示名" min-width="100" />
          <el-table-column prop="sortOrder" label="排序" width="60" />
          <el-table-column label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="remark"
            label="备注"
            min-width="100"
            show-overflow-tooltip
          />
          <el-table-column
            v-if="can('system:dict:item:edit')"
            label="操作"
            width="65"
          >
            <template #default="{ row }">
              <el-button link type="primary" @click="openItem(row)">
                编辑
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-dialog
      v-model="typeDialog"
      :title="editingTypeId === undefined ? '新增字典类型' : '编辑字典类型'"
      width="480px"
    >
      <el-form :model="typeForm" label-width="90px">
        <el-form-item label="类型编码">
          <el-input
            v-model="typeForm.code"
            :disabled="editingTypeId !== undefined"
            placeholder="小写字母、数字、下划线"
          />
        </el-form-item>
        <el-form-item label="类型名称">
          <el-input v-model="typeForm.name" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="typeForm.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="typeForm.remark" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveType">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="itemDialog"
      :title="editingItemId === undefined ? '新增字典条目' : '编辑字典条目'"
      width="480px"
    >
      <el-form :model="itemForm" label-width="90px">
        <el-form-item label="条目值">
          <el-input
            v-model="itemForm.value"
            :disabled="editingItemId !== undefined"
          />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="itemForm.label" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="itemForm.sortOrder" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="itemForm.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="itemForm.remark" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveItem">
          保存
        </el-button>
      </template>
    </el-dialog>
  </Page>
</template>
