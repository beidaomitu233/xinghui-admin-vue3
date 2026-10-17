# 启动验证

本页面向开发者和部署验收人员。目标是用最小、可观察的步骤确认当前环境配置正确；不以网页能打开、构建成功或模拟响应替代真实认证和服务检查。准备已初始化的自有环境及已改密账号，禁止在其他人的业务库写测试数据。

## 检查配置与迁移

1. 记录前后端代码提交、工具链版本和部署配置版本，不记录密钥值。
2. 从数据库连接确认 schema、账号及 server 版本。
3. 只读查询迁移历史，确认没有失败记录；当前一期源码须包含V180、V190、V200、V210和V220，不能只到旧基线V170。

```sql
SELECT DATABASE(), CURRENT_USER(), VERSION();
SELECT installed_rank, version, description, type, script, success
FROM flyway_schema_history ORDER BY installed_rank;
SELECT COUNT(*) AS failed_migrations
FROM flyway_schema_history WHERE success = 0;
```

当前配对后端默认migration目录含27个versioned SQL；旧v1.2.0教程基线为22个至V170。启用历史optional repeatable清理location的环境还会有对应R记录。不要仅用总行数判断版本匹配。首次空库应完整迁移，重启应validate并保持已有数据；详细规则见[数据库迁移](../reference/database-migrations.md)。

## 浏览器最小验证

在开发环境打开应用默认地址，或打开自己的 HTTPS 部署地址：

1. Network 中登录请求为同源 `/api/user/login`，不发送到上游 mock。
2. 用自有账号登录，`/api/user/info` 返回当前用户、角色和操作码；ID 保持字符串。
3. `/api/user/router` 返回服务端过滤的菜单，不只是静态页面列表。
4. 具备相应授权的管理员可看到系统管理、通用能力、运行维护、AI管理四个一级组；普通账号可进入本人资料/收件箱，不能自动访问其他管理接口。不要将未授权组隐藏误判为迁移失败。
5. 打开一个获授权页面，确认列表、空态及详情请求正常；缺页仍在当前 URL 展示回退与重试，不恢复前一个页面内容。
6. 注销后再次请求受保护接口，应未认证；不要把 localStorage 清空当成服务端注销成功。

可用本人只读接口补验，令牌在当前终端内使用，不保存到教程或公开日志：

```bash
# TOKEN 由本环境已完成的登录取得，使用原始 JWT，不带 Bearer 前缀。
curl --fail-with-body -H "Authorization: ${TOKEN}" \
  'https://admin.example.com/api/system/profile'
```

示例域名需换成自己的部署域名。正常响应形状为 `{"code":200,"message":"成功","data":{...}}`，但 `curl` 的 HTTP 成功不保证业务 code 成功，仍需解析 JSON。

## 可选服务与文档

对象存储配置完成后，用自己的最小非敏感文件验证上传、详情、下载与删除，核对远端对象和数据库记录；上传限制见[接口约定](../reference/api-conventions.md#上传与下载)。没有配置 OSS 时不把文件入口截图当成链路可用。

不在普通启动验证中发送真实短信、微信授权或 AI 供应商请求。微信 PC 网站能力需要外部资格与回调配置；模型测试也可能产生费用或触发限流，须使用单独授权的验证计划。

完整文档中心部署后检查 `/docs/` 首页、一个深页刷新、中文和英文搜索、404与应用帮助入口；必须保留完整54页、链接/锚点和产物检查，不能建立空页或使用部分构建替代完整发布。

## 质量验证与结论

需要发布质量证明时按[质量门槛](../operations/quality-gates.md)运行实际 root/app/auth 测试、类型/lint/生产构建、后端必需测试和隔离空库服务。记录每一项命令、退出码与产物提交配对，结果不跨代码版本借用。

[当前源码配对](../releases/versions.md)的正式前后端CI已通过，后端MySQL5.7与8.0两组服务矩阵通过，另有真实低代码摘要生成、采纳草稿、人工保存与刷新核对的组合证据。这些结果不免除读者目标环境的启动与升级验证，也不证明真实微信、全部模型供应商或二期Agent已完成。

失败应记录具体层次：启动配置、迁移、HTTP、业务 code、权限、供应商或浏览器；不要统一写“接口失败”。本文验证步骤是操作指南；当前文档版已验证范围见[版本组合](../releases/versions.md)，读者的新环境仍须自己执行。

## 源码依据

后端 `system-admin/src/test/java/com/xinghuiTec/quality/ReleaseServicesIT.java`、`scripts/quality/Verify-Build.ps1`、`system-admin/src/main/resources/application.yml`；前端 `apps/web-ele/src/router/routes-recovery.test.ts`、`src/router/menu-cleanup.test.ts`、`src/store/auth-session.test.ts`、`src/api/core/session-info.ts`、`scripts/verify-app-tests.mjs`、`scripts/build-quality.mjs`。
