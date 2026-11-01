# 组件使用

优先使用 Vben 组件与 Element Plus。组件稍有差异时在适配层调整，业务页面只组合功能。

| 场景     | 组件 / 入口                             |
| -------- | --------------------------------------- |
| 页面     | Vben `Page`                             |
| 列表     | `useVbenVxeGrid` / VXE Table            |
| 表单     | `useVbenForm`                           |
| 弹窗     | `useVbenModal`                          |
| 侧栏编辑 | Element Plus Drawer                     |
| 状态反馈 | ElMessage、ElAlert、ElSkeleton、Loading |
| 图表     | `@vben/plugins/echarts`                 |
| 对话     | AgentScope WebUI                        |

适配代码位于 `apps/web-ele/src/adapter`。参考 [Vben 文档](https://doc.vben.pro/)和 [Element Plus 文档](https://element-plus.org/zh-CN/)。
