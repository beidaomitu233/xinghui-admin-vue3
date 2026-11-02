# 请求与页面状态

统一通过 `requestClient` 调用 API，接口类型放在 `src/api`。列表查询与表单保存分开管理 Loading。

- 搜索、排序或分页变化时发起查询。
- 保存成功后重新读取服务端结果，更新列表。
- 失败显示可重试状态，保留用户输入。
- 切换账号或路由时忽略已经失效的请求结果。
- 流式 AI 响应使用现有 SSE 适配器，取消与重连沿用请求 ID。

已有示例位于 `views/system/user`、`views/system/ai-template` 和 `views/ai/workbench`。
