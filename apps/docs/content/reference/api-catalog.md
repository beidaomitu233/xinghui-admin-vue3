# API 目录

浏览器同源请求统一加 `/api`，下表为后端路径。参数与返回类型可在前端 `src/api` 和后端 Controller 查看。

| 分类       | 路径入口                                           |
| ---------- | -------------------------------------------------- |
| 认证       | `/user/login`、`/auth/sms/*`、`/auth/wechat/*`     |
| 用户与角色 | `/system/user/*`、`/system/role/*`                 |
| 系统       | `/system/menu/*`、字典接口、`/system/config/*`     |
| 业务配置   | `/system/businessConfig/{section}`                 |
| 文件       | `/system/oss/*`                                    |
| 提示词场景 | `/ai/scenes/*`                                     |
| AI 统计    | `/system/ai/call-logs/analytics`                   |
| 调用日志   | `/system/ai/call-logs`、`/{id}`                    |
| 输出评价   | `/system/ai/call-logs/{id}/feedback`               |
| Agent 扩展 | `/system/ai/extensions`、`/{id}/tools`、`/catalog` |

扩展配置的 `config` 按 SKILL、MCP、KNOWLEDGE 类型保存；密钥仅写入，响应返回 `secretSet` 状态。开发工具见 [Agent 业务开发](../development/ai-extension.md)。
