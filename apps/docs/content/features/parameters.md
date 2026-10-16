# 参数设置

入口为 **系统管理 → 参数设置**。这是受控参数目录，不是数据库任意配置编辑器，也不承担业务密钥管理；微信、短信、存储使用[业务配置](/features/business-config)。

## 可管理范围

平台身份及 `system:config:*` 权限才能管理。服务只暴露目录内的 key，未知历史 key 不作为页面选项。

| key | 合法值/边界 |
| --- | --- |
| `sys.index.skinName` | skin-blue、skin-green、skin-purple、skin-red、skin-yellow |
| `sys.index.sideTheme` | theme-dark、theme-light |
| `sys.account.captchaOnOff` | true / false；影响验证码有效配置 |
| `sys.account.registerUser` | true / false；记录不代表已有自助注册能力 |
| `sys.index.footerText` | 可创建的页脚纯文本，最长100字符，不接受HTML/控制字符 |

## 操作步骤

读取列表，选择已有参数修改 value。新增仅用于允许创建的目录项，不能通过自定义 key 启用一个尚未实现的功能。保存后重新读取，观察 `runtimeActive` 与 `deletable`；不是每个存量参数都能删除或立即改变当前浏览器主题。

接口为 `GET /sysConfig/list`、`GET /sysConfig/{id}`、`POST /sysConfig`、`PUT /sysConfig/{id}`、`DELETE /sysConfig/{id}`，保存 body 使用 `configKey/configValue`。不要套用 `/system/config` 的假定路径。

## 正常结果与恢复

页面展示已保存的 value 和运行状态。验证码相关更新涉及提交后的缓存刷新，应重新打开登录页核对，不用旧页面状态下结论。非法枚举、不可创建 key 或不可删除项会被拒绝；恢复时按目录值重新提交。列表失败可以重试，编辑失败保留内容；不要把供应商密钥填进普通参数 value。

## 源码依据

- 前端：`apps/web-ele/src/api/system/config.ts`、`apps/web-ele/src/views/system/config/index.vue`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/service/impl/SysConfigServiceImpl.java` 的 `CATALOG`、`getPublishedValue`、有效验证码缓存。
- 身份过滤：`system-admin/src/main/java/com/xinghuiTec/security/PlatformVisibilityService.java`。
