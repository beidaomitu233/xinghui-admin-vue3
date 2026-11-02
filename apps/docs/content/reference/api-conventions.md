# API 约定

接口使用统一 `Result` 包装：`code`、`msg`、`data`。前端 `requestClient` 处理认证和业务错误。

- ID 使用字符串传递，保留长整型精度。
- 分页传入 `pageNum`、`pageSize`；排序使用白名单字段。
- Controller 接收 DTO，Service 负责业务校验与事务。
- 当前用户与租户从认证上下文获取。
- AI 流式响应使用现有 SSE 接口，普通业务查询继续使用 JSON。

调用代码放在 `src/api`，页面不直接拼接第三方供应商请求。
