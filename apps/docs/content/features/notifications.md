# 通知公告与通知中心

通知公告保留在通用能力中，按 `system:notice:*` 权限维护标题、类型、正文和状态。类型来自 `notice_type` 字典。

## 查看与处理通知

点击右上角铃铛查看预览与未读数，点击“查看全部”打开通知中心。完整中心提供分页、全部/未读筛选、详情、单条及批量已读、刷新和关联目标。没有其他业务菜单的登录账号也能使用顶部通知中心，无需通知管理权限。旧 `/notifications?notificationId=...` 深链仍打开相同中心，不增加左侧菜单。

批量已读发送 `{ ids: [...] }`，最多100个正整数ID；服务端按当前会话用户和租户校验全部ID，不能用请求字段切换收件人。操作成功后读回列表、详情和未读徽标，失败可重试。

目标跳转同时检查已登记路由、权限及业务记录校验。失效、退役或无权目标保留通知可读并显示恢复提示；外部目标不自动打开，不把身份凭据放进URL。

## 业务投递

可信服务端业务模块通过内部 Publisher 提交标题、正文、目标快照，校验后保存PENDING；后台认领、重试并幂等写入收件箱。PENDING不是已送达。客户端不能任意指定收件人发布消息，详情与已读接口保持本人范围。

USE-05退役通知模板管理及资讯管理，删除其页面/API/菜单权限和专属表。历史事件与收件箱保留；升级时，关联禁用或缺失模板的未完成旧请求转为 `FAILED/TEMPLATE_RETIRED`，不能走临时错误补偿；合法旧快照继续投递。新迁移不改旧checksum。

源码：`layouts/personal-notification-entry.vue`、`layouts/notification-center.vue`、`api/system/personal-notification.ts`、`views/system/notification/target-navigation.ts`；后端 `NotificationInboxController`、`NotificationEventService`、`NotificationDeliveryService` 和 `NotificationContentRules`。接入见[业务事件](../development/notification-event.md)。
