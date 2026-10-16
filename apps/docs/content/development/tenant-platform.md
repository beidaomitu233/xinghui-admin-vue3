# 租户、平台与本人范围

本页用于设计数据访问边界。前置是认证服务已提供LoginUser；不要相信客户端传来的tenantId、userId或角色名来建立服务端身份。

## 三种范围

| 范围 | 当前例子 | 服务端判断 |
| --- | --- | --- |
| 平台管理 | 参数、字典设计、业务配置、调度、AI设计、资讯、低代码设计 | 平台身份加精确动作权限 |
| 租户记录 | 低代码记录 | 当前认证tenant+form+record联合范围，按动作权限操作 |
| 本人数据 | 个人通知、本人资料、文件管理 | 当前认证tenant/user或createBy与目标记录联合范围 |

低代码creator记录创建者，但当前SQL不以creator限制为“仅本人记录”；同租户具备对应权限者可管理该租户该表单的记录。不要把所有业务数据都写成本人可见，也不要把平台身份说成自动越过记录tenant过滤。

## 开启与关闭租户

tenant.enable=true时，platformAccess要求账户tenant与会话tenant都为默认平台tenant；不依赖动态/忽略SQL上下文。关闭时认证用户通过平台身份门槛，但动作权限仍检查。低代码关闭租户时使用默认000000范围。

MyBatis的租户插件与JdbcTemplate不同；后者必须明确写tenant条件。更改tenant.enable涉及既有数据和会话语义，不能在生产中当作临时越权开关。部署步骤由[环境配置](/guide/configuration)说明。

## 扩展时的检查顺序

先认证，再检查动作，再读资源所属tenant及业务所有者规则，最后取业务值。读取和写入使用相同资源范围；不能先读完整内容再判断tenant。跨租户或不存在返回服务定义的拒绝，不在错误中复制他人资料。

## 正常结果与验证

平台管理对普通租户不可见且直调拒绝；低代码同租户受权记录操作可用，跨tenant/form拒绝；本人通知跨用户ID拒绝。同一tenant两个用户的低代码记录和本人通知应得到不同范围结果。新增SQL遗漏tenant条件时应修复服务，不能靠前端不显示兜底。

## 源码依据

`system-admin/src/main/java/com/xinghuiTec/security/PlatformAccessService.java`、`PlatformVisibilityService.java`；`lowcode/LowcodeIdentity.java`、`lowcode/LowcodeService.java`；`notification/NotificationInboxService.java`。MyBatis插件为 `common/common-tenant/src/main/java/com/xinghuiTec/config/tenant/PlusTenantLineHandler.java`。
