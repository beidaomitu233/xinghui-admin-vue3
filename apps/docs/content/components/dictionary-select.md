# useDictionary：选项与历史标签

用于业务下拉与列表标签，不用于字典管理。前置是认证业务读取权限及已存在的字典code；code/value都按稳定业务标识传递。

## 接口

`useDictionary(code: string)`返回options、loading、error、labels内部缓存对应的访问动作load、ensureLabels、label。options是 `DictOption[]`；error是boolean，不是错误文本。load不在构造时自动执行。

`ensureLabels(values)`接收null、number、string或undefined数组，把缺失的非空值转换为字符串查询；label(value)返回缓存标签或原始字符串。历史停用值不在options中，仍可通过标签接口读取。

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { DICT_TYPE, useDictionary } from '#/composables/use-dictionary';

const value = ref('');
const { options, loading, error, load, ensureLabels, label } = useDictionary(
  DICT_TYPE.NOTICE_TYPE,
);
onMounted(async () => {
  await load();
  await ensureLabels([value.value]);
});
</script>

<template>
  <el-select v-model="value" :loading="loading">
    <el-option
      v-for="item in options"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>
  <p>{{ label(value) }}</p>
  <el-button v-if="error" @click="load">重新读取选项</el-button>
</template>
```

## 正常结果与恢复

正常选项只用于新选择，历史值显示标签或原始值，不自动改写数据。ensureLabels的单个读取失败保持原始值回退，后续可重试；load失败清空options并设置error，不能用空选项强制覆盖既有选择。工具用requestId抑制旧load覆盖新状态，但不取消HTTP请求。

## 源码依据

`apps/web-ele/src/composables/use-dictionary.ts`（`DICT_TYPE`仅内置NOTICE_TYPE/JOB_STATUS）；`apps/web-ele/src/api/system/dict.ts`（`getDictOptions/getDictLabel`）；相邻 `use-dictionary.test.ts`覆盖停用历史值和晚响应。
