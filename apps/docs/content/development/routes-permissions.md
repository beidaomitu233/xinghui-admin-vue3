# 路由、菜单与动作权限

适用于新增页面和排查“菜单有但打不开”“按钮隐藏但API能请求”等问题。先区分认证核心路由、后端授权菜单、隐藏业务路由和旧链接redirect。

## 当前路由链路

核心Root使用basic布局，Profile与PersonalNotificationInbox是认证入口；后端 `/user/router`返回可见菜单，routes-helper转换组件路径并生成菜单。找不到组件进入专用路由错误页面，不能静默装成成功页面。

低代码隐藏路由为 `/lowcode/runtime/:formId`、`/lowcode/records/:formId`，纯RouteRecordRaw定义在lowcode模块，注册由统一路由组合完成；不要在模块导入时新增guard或延迟自注册。微信旧链接由legacy-wechat转换到新业务配置分区，仍受目标页权限控制。

## 一次完整授权

1. 创建/确认C页面的path、component及list动作。
2. 为query/add/edit/remove等创建F按钮权限，权限串与Controller完全一致。
3. 在角色管理分配这些菜单ID，把角色分配给目标用户。
4. 从服务端恢复当前accessCodes与路由，用新会话验证入口和直接请求。
5. 未登录、无页面权限、无动作权限、非平台身份分别验证，不靠隐藏菜单结束检查。

平台资源使用 `@platformAccess.isPlatformIdentity() and hasAuthority(...)`；一般业务动作使用精确authority并在服务约束数据。低代码runtime读取是record五种权限的anyAuthority，不把它等同于list/query或add授权。

## 组件位置与失败恢复

component如 `system/dict/index`对应views文件，不带.vue；path保持已有绝对深链。未知组件应核对文件大小写、导入映射和打包结果。授权树读取失败停止覆盖保存。换用户后清理路由/访问状态由统一会话逻辑负责，不能永久保留上一位用户的菜单。

本人通知菜单不依赖模板管理权限；不要为它增发平台模板权限。当前源码四个一级导航为系统管理、通用能力、运行维护、AI管理；目录授权不单独赋予页面/API能力，也不是四种权限角色。V170三组布局属于旧基线，V180增加AI管理，V210补齐AI动作权限。

V244将AI配置恢复为独立二级页`/ai/configurations`，复用原页面与动作授权。配置列表、详情、保存、扫描、测试和启用分别按实际动作检查；草稿Key扫描允许平台add/edit/test任一，不因此获得配置query或已存Key读取能力。菜单可见、前端隐藏按钮和扫描目录结果都不能替代服务端授权与连接验证。

## 源码依据

前端 `apps/web-ele/src/router/routes/core.ts`、`routes-helper.ts`、`routes/modules/lowcode.ts`、`routes/legacy-wechat.ts`；后端 `system-admin/src/main/java/com/xinghuiTec/security/PlatformVisibilityService.java`、`lowcode/LowcodeRecordController.java`。
