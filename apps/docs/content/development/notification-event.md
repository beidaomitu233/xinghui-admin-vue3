# 发送业务通知

业务完成后通过 `NotificationEventPublisher` 提交站内事件：

```java
publisher.submit(new NotificationEventPublisher.Event(
    tenantId, recipientUserId, "order.completed", orderId,
    "订单已完成", "订单处理已完成。", "/orders"));
```

tenantId、收件人和业务事件键从实际业务结果取得。同一事件键幂等，通知服务负责投递到个人收件箱。

通知在右上角通知中心展示。服务实现位于 `system-admin/.../notification`。
