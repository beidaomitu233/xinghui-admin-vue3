# 业务事件接入站内通知

面向可信业务模块，前置为已创建启用模板、收件人存在且属于业务允许的tenant。事件发布接口是内部Java接缝，不是允许浏览器任意指定收件人发消息的HTTP API。

## 提交契约

`NotificationEventPublisher.Event`字段为tenantId、recipientUserId、eventCode、eventKey、variables。tenant格式为字母数字下划线连字符、1–20字符；eventCode小写字母起始、最长100；eventKey为字母数字点下划线冒号连字符、1–128字符。variables只能提供模板白名单要求的字符串值。

```java
package example;

import java.util.Map;
import com.xinghuiTec.notification.NotificationEventPublisher;

public class NotificationSubmitExample {
    public static NotificationEventPublisher.Submission submit(
            NotificationEventPublisher publisher, String trustedTenant,
            long trustedRecipient, String businessEventKey) {
        return publisher.submit(new NotificationEventPublisher.Event(
                trustedTenant, trustedRecipient, "example.completed",
                businessEventKey, Map.of("subject", "中性示例")));
    }
}
```

example.completed是文档示例编码，调用前必须真实注册匹配模板；trustedTenant/Recipient来自服务端业务授权结果，不能直接透传浏览器字段。本示例不在文档检查时执行。

## 投递阶段

submit校验模板并保存PENDING请求，返回requestId/status。后台poll认领请求到PROCESSING，收件箱插入与请求完成共用事务，最多3次自动尝试；过期租约可重新认领。收件箱去重按业务事件/收件范围保证，不把两次请求ID相同当作唯一幂等证明。

## 正常结果与恢复

PENDING表示接收，不表示送达；本人收件箱出现消息后才能验证delivery。参数/模板错误会记录REJECTED安全错误码，不保存完整失败内容。临时投递失败由有限重试处理；耗尽后的requeueTransientFailure是内部补偿，不是公开管理页按钮。不能用markFailed重写已经完成的请求。

模板target和变量都按规则渲染，拒绝脚本、未授权目标与缺失变量。业务事务与事件提交需按真实调用边界安排，不在业务回滚后假造“已完成”通知。当前站内投递不代表短信/邮件通道已通用接入。

## 源码依据

`system-admin/src/main/java/com/xinghuiTec/notification/NotificationEventPublisher.java`、`NotificationEventService.java`、`NotificationDeliveryService.java`、`NotificationTemplateRules.java`；客户端读取见[通知手册](/features/notifications)。
