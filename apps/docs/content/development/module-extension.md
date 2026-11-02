# 新增业务模块

## 开发顺序

1. 新增 Flyway 迁移，建立业务表。
2. 编写实体、DTO、Mapper 和 Service。
3. 添加 Controller 与动作权限。
4. 前端增加 API 类型和页面。
5. 配置菜单、G 业务模块和 F 动作，为角色授权。
6. 注册 Agent 资源提供者，让中台调用同一业务服务。

## 页面组件

列表优先使用 `useVbenVxeGrid`，表单使用 `useVbenForm`，编辑弹窗使用 `useVbenModal`。表头启用排序，少量常用条件留在工具栏，更多条件展开显示。

业务按钮放在页面工具栏背景上；筛选与数据表格分区排列。具体组件入口见 [组件概览](../components/overview.md)。

## 接入 Agent

实现 `AgentResourceProvider` 并注册为 Spring Bean。提供资源目录、字段、查询和业务动作，复用 Service 的权限与事务。完整说明见 [Agent 业务工具](ai-extension.md)。
