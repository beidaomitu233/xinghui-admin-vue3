# 业务配置：微信、短信与存储

入口为 **系统管理 → 系统业务配置**，地址 `/system/business-config`。单页包含微信、短信、OSS三个独立分区；每个分区独立加载、保存和报告失败。旧微信配置深链由前端 redirect 转到当前微信分区。

## 身份与前置

平台身份配合 `system:businessConfig:query/edit`。仅查询身份可以读取和重试，不能保存。数据库密钥能力要求部署者设置稳定的 `CONFIG_MASTER_KEY`：Base64编码的恰好32随机字节；不在前端配置或文档中填真实值。

| 分区 | parameters | 写入型 secrets |
| --- | --- | --- |
| wechat | clientId、callbackUri、credentialMode、secretEnvName | appSecret |
| sms | provider、signature、templateId、region、sdkAppId | accessKeyId、accessKeySecret |
| oss | provider、endpoint、bucket、basePath | accessKey、secretKey |

## 操作步骤

1. 滚动到要维护的微信、短信或存储区域，确认当前生效说明与密钥“已配置”标记；读取不返回密钥明文。技术响应中的source/effectiveState/encryptionReady用于解释配置来源、状态和加密能力。
2. 修改公开参数及 enabled。留空密钥输入表示保留原配置，明确勾选清除才进入 `clearSecrets`。
3. 点击该区域“保存微信网站授权”“保存短信服务”或“保存对象存储”，以该分区原revision提交；不要拿其他分区的revision，也不要把保存一个区域理解为保存全部区域。
4. 成功后读回公开参数与状态。失败时保留输入，针对分区重试；并发冲突先重新读取，再合并自己的修改。

例如维护短信参数时，选择区域中的“供应商”，填写已获授权的“短信签名”和“模板编号”，保持“启用”关闭，仅保存该区域；重新读取后公开参数应一致，微信和存储输入不会被该操作提交。没有真实供应商资质时不点击发送，也不据保存成功声称短信已送达。

`GET/PUT /system/businessConfig/{section}` 使用上述 section。PUT body为 `enabled, parameters, secrets, clearSecrets, revision`；GET返回 `secretsConfigured`布尔映射，没有 secrets值。

## 实际能力边界

微信是 **PC网站授权**，不是公众号、小程序或完整扫码登录。当前只有网站授权发起/state验证；回调账号绑定、扫码登录及绑定管理尚未交付，没有真实网站应用资质时实际扫码验证暂缓。显示配置就绪不能当作第三方身份已验证。短信适配阿里云/腾讯云，`ADAPTED_SEND_UNVERIFIED`不表示真实发送成功。存储运行时目前支持MinIO；启用保存会校验连接与桶，失败保留原配置，历史文件继续依据原平台版本读取。

首次保存前允许沿用显式部署存储配置；保存后的数据库enabled/revision决定当前运行配置。不能每次启动重生成主密钥，否则历史密文无法解密。恢复和备份规则见[安全运维](/operations/security)。

## 源码依据

- 前端：`apps/web-ele/src/views/system/business-config/index.vue`、`apps/web-ele/src/api/system/business-config.ts`、`apps/web-ele/src/router/routes/legacy-wechat.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/businessconfig/BusinessConfigService.java`（`PARAMETERS`、`SECRET_FIELDS`、`Change/View`）。
- 加密：`common/common-core/src/main/java/com/xinghuiTec/config/SecretCipher.java`；存储：`common/common-oss/src/main/java/com/xinghuiTec/oss/config/OssRuntimeSettings.java`。
