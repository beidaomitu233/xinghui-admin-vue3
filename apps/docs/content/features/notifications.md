# 公告、模板与本人通知

入口为 **通用能力 → 公告管理、通知模板、个人通知**。它们是三种不同的数据：公告管理维护公告，模板定义业务事件的文本，本人通知只显示当前会话接收的消息。

## 身份边界

公告按相应 `system:notice:*` 动作授权；模板需要平台身份和 `system:notificationTemplate:list/add/edit`。本人收件箱 `/notifications` 为认证核心入口，不以模板管理权限为前置；任何ID读取或已读修改都由服务端结合当前tenant/user限定，不能查看其他用户消息。

## 操作流程

公告先编辑标题、类型、正文与状态，保存后读回；类型选择取 `notice_type` 字典。在通知模板页新增时，填写“事件编码”“模板名称”“标题模板”“正文模板”“允许变量”“目标路径”“启用”，后续编辑不改变事件编码。它们对应eventCode/name/titleTemplate/bodyTemplate/allowedVariables/targetTemplate/enabled；变量必须在白名单内，不执行表达式或HTML。

本人通知可按未读筛选、打开详情、标记已读或批量已读。批量请求是 `{ ids: [...] }`，最多100个正整数ID。未读数量读回后才更新徽标；页面不允许输入任意tenantId/userId来切换收件人。

## 结果与恢复

业务事件提交PENDING表示请求已持久化，不表示通知已送达。后台投递有认领、有限重试与收件箱去重，完成后本人收件箱才出现消息。模板变量缺失会拒绝事件，不静默填样例值。收件箱失败可重新读取；标记已读失败不要直接在界面永久抹去未读。

target只允许验证过的站内目标或明确HTTPS主机白名单；前端再次验证导航。失效目标应保留消息可读，不能为了跳转把JWT或手机号加进URL。当前事件接缝用于站内消息，不代表邮件/短信渠道已完成通用多渠道编排。

## 源码依据

- 前端：`apps/web-ele/src/api/system/personal-notification.ts`、`notification-template.ts`，以及 `apps/web-ele/src/views/system/notification/target-navigation.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/NotificationInboxController.java`、`controller/NotificationTemplateAdminController.java`。
- 投递：`system-admin/src/main/java/com/xinghuiTec/notification/NotificationDeliveryService.java`；开发接入见[通知事件](/development/notification-event)。
