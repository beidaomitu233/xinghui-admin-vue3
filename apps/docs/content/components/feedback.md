# 帮助、加载与错误反馈

后台页应让用户知道正在加载、没有数据、权限不足或需要重试。PageHint用于简短的页面帮助，不是常驻的所有业务规则清单。

## PageHint契约

| Props     | 类型         | 默认/效果                         |
| --------- | ------------ | --------------------------------- |
| `title`   | string，必需 | el-alert的标题                    |
| `details` | string，可选 | 有值时渲染details/summary展开说明 |

内部固定 `type="info"`、show-icon、closable。没有severity、persistent、onRetry等自定义Prop，也没有自定义关闭事件；关闭是Element Plus alert行为，不能声称会跨会话永久记住关闭状态。

```vue
<script setup lang="ts">
import PageHint from '#/components/page-hint.vue';
</script>

<template>
  <PageHint
    title="修改字典标签不会改变历史业务值"
    details="停用项不用于新选择，历史记录仍通过标签接口读取。"
  />
</template>
```

## 请求与保存反馈

- loading时禁用重复操作，数据未读到前不展示假详情。
- error时给重试入口，不能把失败响应转换成空态。
- empty仅用于一次成功读取得到的空结果。
- 保存失败保留输入，显示就近字段错误与可关闭摘要；不要在长提示中复制原始服务器堆栈。
- 成功保存而列表刷新失败，明确提示已保存，允许手动重读。

ElMessage/ElMessageBox与统一requestClient已经处理通用错误；页面保留本地错误区用于持续恢复，不反复弹出相同长信息。只读详情不显示保存成功按钮，取消确认不报告失败。

## 源码依据与正常结果

提示能关闭、详细说明默认收起，表单仍可使用；重试只触发必要读取。`apps/web-ele/src/components/page-hint.vue`及 `page-hint.test.ts`定义实际Props和折叠/关闭行为；参数与字典页在 `apps/web-ele/src/views/system/config/index.vue`、`dict/index.vue`使用该组件。
