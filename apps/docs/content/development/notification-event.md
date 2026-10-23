# 业务事件接入站内通知

接口仅供可信服务端业务模块调用，不提供浏览器可任意指定收件人的发布API。收件人和tenant必须来自业务授权结果。

## 内容快照契约

```java
import com.xinghuiTec.notification.NotificationEventPublisher;

public class NotificationSubmitExample {
    public static NotificationEventPublisher.Submission submit(
            NotificationEventPublisher publisher, String trustedTenant,
            long trustedRecipient, String businessEventKey) {
        return publisher.submit(new NotificationEventPublisher.Event(
                trustedTenant, trustedRecipient, "example.completed", businessEventKey,
                "业务已完成", "该业务的处理结果已保存。", "/system/user"));
    }
}
```

示例不自动执行。业务事件编码须反映真实已发生事件；生产调用中按业务结果生成文案与获准目标，不能直接透传浏览器内容或身份。无需注册通知模板。

Event字段为tenantId、recipientUserId、eventCode、eventKey、title、body、target。tenant为字母数字下划线连字符1–20字符，eventCode小写字母起始最长100，eventKey为字母数字点下划线冒号连字符1–128。标题不能为空、最多200字符，正文不能为空、最多4000字符；控制字符受限，正文允许换行和tab。目标可空；站内路径禁止上跳/反斜杠/控制字符，外链仅允许配置白名单中的HTTPS主机。

## 投递与恢复

submit保存不可变快照并返回PENDING；业务事务回滚时不应留下“业务已完成”事件。后台认领至PROCESSING，插入收件箱和请求完成在同一事务；最多3次自动尝试，租约过期可恢复。同租户、收件人、事件编码、业务事件键幂等，重复事件保留首次成功内容。

投递时复核实际收件人存在、未删除、启用及tenant匹配，并重验目标白名单。无效内容记录安全拒绝码，不保存失败正文。临时失败补偿仅作用于 `FAILED/DELIVERY_ERROR`；`TEMPLATE_RETIRED` 不得重新排队。历史已完成事件及已读收件箱保留。

当前为站内消息，不代表短信/邮件已经通用接入。源码位于 `system-admin/src/main/java/com/xinghuiTec/notification/` 的 `NotificationEventPublisher`、`NotificationEventService`、`NotificationContentRules`、`NotificationDeliveryService`；用户操作见[通知中心](../features/notifications.md)。
