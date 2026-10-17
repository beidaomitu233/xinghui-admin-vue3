# 安全部署与权限边界

本页用于部署者和开发者核对当前实现的真实安全边界，不替代组织自己的审计、数据分级或生产安全方案。前提是完成初始化账号处理、版本配对和[配置](../guide/configuration.md)。

## 密钥与凭据

`JWT_SECRET`从服务端环境读取，至少32个UTF-8字节，缺失/过短拒绝启动。不要将服务端密钥放进VITE变量、URL、浏览器存储配置或公开示例。JWT本身是登录凭证，请求头采用原始token，反代与访问日志应脱敏。

`CONFIG_MASTER_KEY`是Base64的32字节AES-GCM主密钥，业务配置和模型DB凭据按purpose绑定加密。读取接口显示是否配置/来源/运行状态，不能返回密钥明文；“保留、替换、清除”必须有明确操作。主密钥必须稳定并受控备份，当前没有自动轮换重加密工具。

前端`VITE_APP_STORE_SECURE_KEY`可见于产物，只用于前端持久化处理，不是服务端授权根。生产默认`/api`，不向上游mock发送真实凭据。初始化种子密码和演示账号处理见[首次登录](../guide/first-login.md)。

## 平台、操作码与资源范围

Controller的`@PreAuthorize`及服务端身份校验是实际授权依据。平台接口通常要求 `@platformAccess.isPlatformIdentity()` 与操作码同时满足；前端按钮/菜单隐藏用于用户体验，不能代替服务验权。

| 资源 | 当前额外边界 |
| --- | --- |
| 本人资料 | 服务端获取当前userId，不允许通过请求选择他人 |
| 本人通知 | 当前数据库用户有效，recipient_user_id与tenant匹配；批量先整体验权 |
| 文件 | 当前创建者，启用租户后还匹配tenant；所有下载/详情/删除均验权 |
| 低代码表单 | 平台身份+操作码管理；不能匿名公开填写 |
| 低代码记录 | formId+tenant过滤、操作码；creator由认证主体写入，查询不统一仅本人 |
| AI场景 | 注册app对应业务权限、服务端主体/资源校验、明确context字段 |

默认 `tenant.enable=false`，启用前核对既有数据、默认租户和每条业务路径。MyBatis租户拦截器排除了全局菜单/租户及部分关联表；不能宣传“开关一开所有表自动隔离”。准确模式见[租户与平台](../development/tenant-platform.md)。

## 外部服务与上传

邮件、OSS、Druid默认关闭。开启Druid配置不意味着能访问监控控制台，当前Security明确拒绝`/druid/**`；不要为排障简单加入匿名allowlist。外部服务启用需完整私有配置和单独验证。

OSS上传最大20MiB、扩展名白名单、记录落库/对象失败补偿；这不包含病毒扫描、完整文件格式鉴定或匿名对象访问安全承诺。bucket访问策略、外链有效期、网络ACL和扫描由部署方案补齐；不要把所有bucket设公开来绕过下载问题。

用户导入单文件5MiB、解压尺寸/行数/请求长度限制，与通用文件上传不同。场景读取限制16KiB JSON、禁止请求伪造身份/表达式/SQL/URL，返回no-store和traceId。供应商测试目标、重定向和返回值有受控边界，仍需审查部署代理与出站策略。

## 日志与公开文档

日志可用于诊断，但不能记录密码、JWT、验证码、配置密钥、真实手机号、批量数据全文或AI prompt/context。数据库异常向客户端返回短提示；供应商错误按outcome/状态和可用trace定位，不公开完整请求响应。

公开文档不发布任务板、QA记录、临时账号、DPAPI或本机个人目录。敏感漏洞通过项目实际配置的私有联系渠道报告；没有配置渠道时不要虚构邮箱，也不要在公开issue贴可利用凭据。许可与历史公开是独立关口，本机门槛通过不等于授权公开整个Git历史。

## 可验证结果与失败恢复

用无token请求应得到401；有会话但无管理权限仍被拒；跨owner/tenant操作不成功；配置读取不含明文；失效revision保留输入并失败。发现边界不符时记录最小脱敏复现，停止依赖该失败链路的操作，按[贡献流程](../contributing/contribution.md)提交实际修复与测试，不降低规则掩盖。

源码：`system-framework/src/main/java/com/xinghuiTec/config/SecurityConfig.java`、`JwtSigningKeyConfiguration.java`、`common/common-core/src/main/java/com/xinghuiTec/config/SecretCipher.java`、`common/common-tenant/src/main/java/com/xinghuiTec/config/tenant/`；`system-admin/src/main/java/com/xinghuiTec/`下的`controller/`、`lowcode/LowcodeIdentity.java`、`ai/prompt/AiSceneReadService.java`、`config/UserImportUploadLimitFilter.java`；前端`apps/web-ele/src/api/request.ts`及对应权限/会话测试。

## AI对话与数据库引用

新对话的用户/助手正文真实保存在数据库，按本人/租户或明确平台审计权限访问；审计查看不允许冒充本人续聊。技术请求日志仍只记录必要元数据，不能将正文或Key写进普通访问/操作日志。备份与恢复应包含实际消息数据及其访问限制。

通用数据库引用要求独立ai:data:database:read和平台身份，保存场景不向调用者派生此权。认证/凭据/配置等基础设施、秘密字段与结构化秘密键不进入上下文，查询保持只读、参数化及有界。普通有权业务值可以实际预览，不能以统一掩码代替数据授权。

模型扫描仅访问OpenRouter/DeepSeek共享预设中的固定官方目录，不允许调用者指定URL、重定向或任意请求。草稿Key扫描使用16KiB有界JSON与WRITE_ONLY密码字段，明文仅本次内存使用，不进入操作日志、持久化或响应；已存Key只在当前有权配置草稿内选取，不接收任意Key版本。扫描目录、连接验证与执行准入分别判断，目录可选性不等于生成成功。失效Key材料隔离后须通过正常测试恢复，不能手工删状态绕过验证。
