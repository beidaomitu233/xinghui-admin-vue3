# 组件与状态工具选择

本项目的组件参考以当前Element Plus应用适配为准。适用于新增或维护后台页面的前端开发者；需了解Vue3、TypeScript和项目 `#/` 导入别名。现存业务页并未全部统一为VXE或Vben Schema Form，不能直接照搬上游最新版本API。

## 按问题选择

| 需求 | 当前可复用入口 | 注意事项 |
| --- | --- | --- |
| 分页/排序/刷新 | `usePagedList` | 接收records/total；items响应先显式转换 |
| 新增/编辑/只读详情 | `useEntityDialog` | 由调用方提供真实读取、保存与校验 |
| 危险动作确认 | `useConfirmedAction` | allowed和busy只是前端防护，后端仍鉴权 |
| 业务字典 | `useDictionary` | 启用选项与历史标签分开读取 |
| 轻量帮助 | `PageHint` | title必需、details可选，可关闭、可展开 |
| Schema表单 | `#/adapter/form`的`useVbenForm` | 使用本地组件映射及规则 |
| 高级表格 | `#/adapter/vxe-table`的`useVbenVxeGrid` | 默认结果字段items，业务records需要适配 |
| Modal / Drawer | `@vben/common-ui` | API和返回组件成对使用 |
| 文件上传 | `#/api/system/file` | 真实受保护上传，不是低代码附件字段 |

## 接入顺序与正常结果

先确认页面权限与后端响应，再选择状态工具，最后绑定模板。把loading、error、empty、success分开呈现；查询失败不伪装成空列表。保存失败保持输入，详情态禁用写操作。小片段用于说明接口，静态数据示例不证明真实API成功。

遇到组件未注册先检查 `apps/web-ele/src/adapter/component/index.ts`；遇到响应字段不匹配检查适配，而不是修改共享组件给单个页面兜底。前端TypeScript契约不能替代后端字段、权限和租户校验。

## 源码与参考方式

本地入口为 `apps/web-ele/src/composables/`、`apps/web-ele/src/components/page-hint.vue`、`apps/web-ele/src/adapter/`；上游封装实现位于 `packages/@core/ui-kit/`、`packages/effects/common-ui/`、`packages/effects/plugins/`。

分类方式参考[Vben官方文档](https://doc.vben.pro/guide/introduction/vben.html)、[Pure文档源码](https://github.com/pure-admin/pure-admin-doc)和[Jeecg文档中心](https://help.jeecg.com/)。参数和示例来自本地源码，没有把它们的产品能力或版本承诺移植到本项目。
