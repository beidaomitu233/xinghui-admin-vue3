# 系统业务配置

入口为 **系统管理 → 系统业务配置**，地址 `/system/business-config`。微信电脑网站、微信内H5、短信、邮件和对象存储在同一页上下排列，每个分区独立保存、重新读取和报告失败。旧微信配置深链仍转到本页。

## 身份与前置

沿用平台身份及 `system:businessConfig:query/edit` 权限。启用多租户时由平台管理，租户不能查看或编辑；未启用时由管理端维护。仅查询身份可以读取和重试，不能保存。

## 微信登录的使用流程

| 使用场景 | 登录入口 | 用户操作 |
| --- | --- | --- |
| 微信内H5 | 微信内授权登录 | 根据授权范围静默识别或确认授权，不把静默识别画成必须点击同意 |
| 电脑网站 | 微信扫码登录 | 在微信托管的扫码页面，用手机微信扫码并确认 |
| 手机外部浏览器 | 手机号登录或微信内打开指引 | 不照搬电脑扫码，不跨设备转移本次登录状态 |

用户触发登录后，先由微信确认身份，再处理产品账号。已有绑定时检查账号是否仍可用，自动完成登录并返回原业务页面与查询上下文；账号已停用时拒绝登录。没有绑定时先登录已有产品账号，再明确确认关联，不自动创建管理员或授予权限。

取消、失败或到期时保持未登录，可重新发起或使用手机号登录。二维码及扫码确认界面由微信托管；本站不根据页面加载、二维码加载或计时器推断“已扫码”。本站流程区分等待授权、待关联、可完成登录、已取消、已过期、失败及已完成。

### 接入前提

- PC需要已获准的微信开放平台网站应用；微信内H5需要具备网页授权能力的服务号，两类AppID与密钥分别配置。
- PC回调使用 `https://本站/api/auth/wechat/callback`；H5使用 `https://本站/api/auth/wechat/mp-callback`，并在相应微信平台配置授权域名。必须保留 `/api/`，否则本项目网关会把请求交给前端页面。
- 历史网站回调中的 `/auth/wechat/callback` 在读取时规范化为API路径，下一次保存会持久化；旧在途授权到期后重新发起。
- 无真实应用资质和密钥时，不能认为扫码已接通。接入依据见微信官方[网站登录指南](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)和[服务号网页授权](https://developers.weixin.qq.com/doc/service/guide/h5/auth.html)。

## 短信与邮件服务商

短信先选择阿里云或腾讯云，再填写各自的凭据、签名及模板。阿里云提供区域参数；腾讯云使用SecretId、SecretKey与SDK AppID，不把两种供应商字段混在一起。

邮件提供QQ邮箱、163邮箱、企业邮箱和通用SMTP。预设服务商显示对应连接参数，通用SMTP填写主机、端口、登录账号、发件地址及SSL或STARTTLS。授权码或SMTP密码按服务商要求提供。发送组件读取最新有效配置，无需重启；显式停用的数据库配置优先于旧部署配置。

切换服务商不会继承另一服务商的密钥；邮件SMTP主机或登录账号变化也需要重新填写凭据。保存成功不等于短信或邮件已经送达，页面不会因保存而自动发送。

## 技术配置与接口

数据库密钥需要稳定的 `CONFIG_MASTER_KEY`：Base64编码的恰好32随机字节。真实值不放前端、源码或文档；不要在重启时重新生成，否则历史密文无法解密。

| 分区 | parameters | 写入型 secrets |
| --- | --- | --- |
| wechat | clientId、callbackUri、credentialMode、secretEnvName | appSecret |
| wechatMp | clientId、callbackUri、scope | appSecret |
| sms | provider、signature、templateId、region、sdkAppId | accessKeyId、accessKeySecret |
| mail | provider、host、port、security、user、from | password |
| oss | provider、endpoint、bucket、basePath | accessKey、secretKey |

## 操作步骤

1. 滚动到要维护的分区，确认当前状态与密钥“已配置”标记；读取不返回密钥明文。
2. 修改参数及启用状态。同一服务身份下，留空密钥表示保持；明确勾选清除才清除。切换服务商或凭据身份须重新输入。
3. 点击该分区保存按钮，以本分区原revision提交；保存一个区域不会提交其他区域。
4. 成功后读回公开参数与状态。失败时保留输入，针对分区重试；并发冲突先重新读取，再合并自己的修改。

例如维护短信参数时，选择区域中的“供应商”，填写已获授权的“短信签名”和“模板编号”，保持“启用”关闭，仅保存该区域；重新读取后公开参数应一致，微信和存储输入不会被该操作提交。没有真实供应商资质时不点击发送，也不据保存成功声称短信已送达。

`GET/PUT /system/businessConfig/{section}` 使用上述 section。PUT body为 `enabled, parameters, secrets, clearSecrets, revision`；GET返回 `secretsConfigured`布尔映射，没有 secrets值。

## 实际能力边界

本轮实现网站/H5独立配置、一次性授权流程、已有账号关联、账号状态检查与返回原业务。本机受控身份和真实数据库的事务、并发、停用与关联链路已验证；真实微信身份交换、扫码及短信/邮件实际投递仍无供应商凭据验证，不把受控身份当真实微信结果。`ADAPTED_SEND_UNVERIFIED`不表示真实发送成功。存储运行时目前支持MinIO；启用保存会校验连接与桶，失败保留原配置，历史文件继续依据原平台版本读取。

首次保存前允许沿用显式部署存储配置；保存后的数据库enabled/revision决定当前运行配置。不能每次启动重生成主密钥，否则历史密文无法解密。恢复和备份规则见[安全运维](/operations/security)。

## 源码依据

- 前端：`apps/web-ele/src/views/system/business-config/index.vue`、`apps/web-ele/src/api/system/business-config.ts`、`apps/web-ele/src/router/routes/legacy-wechat.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/businessconfig/BusinessConfigService.java`（`PARAMETERS`、`SECRET_FIELDS`、`Change/View`）。
- 微信：同模块 `controller/WechatLoginFlowController.java`、`wechat/WechatLoginFlowService.java`、`wechat/WechatAccountService.java`；新增迁移 `V20261023_310__business_wechat_login.sql`。
- 邮件：`common/common-mail/src/main/java/com/xinghuiTec/mail/config/RuntimeMailService.java`，每次发送按最新数据库快照解析服务商与凭据。
- 加密：`common/common-core/src/main/java/com/xinghuiTec/config/SecretCipher.java`；存储：`common/common-oss/src/main/java/com/xinghuiTec/oss/config/OssRuntimeSettings.java`。
