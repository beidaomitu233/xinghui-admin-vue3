# 注册调度处理器

面向有代码发布权限的后端开发者。当前任务管理仅选择显式注册的JobHandler，不能从请求指定类名、反射方法、Bean名或脚本。平台管理员配置任务参数，代码维护者发布处理器实现。

## 真实接口

`JobHandler`包含key、validateParameters(JsonNode)、execute(JsonNode)。Registry从Spring Bean列表建立不可变注册表，拒绝重复或非法key。key小写分段、允许点/连字符，最长100；具体正则以JobHandlerRegistry为准。

```java
package example;

import com.fasterxml.jackson.databind.JsonNode;
import com.xinghuiTec.quartz.handler.JobHandler;
import org.springframework.stereotype.Component;

@Component
public class ExampleNoopHandler implements JobHandler {
    public String key() { return "example.noop"; }
    public void validateParameters(JsonNode parameters) {
        if (!parameters.isObject() || !parameters.isEmpty()) {
            throw new IllegalArgumentException("只接受空对象");
        }
    }
    public void execute(JsonNode parameters) { /* 中性无副作用示例 */ }
}
```

这是编译契约示例，不是当前已部署的新处理器。实际首次验证可用既有system.noop；新增类需位于项目扫描范围或显式配置，不能把example包复制后假设自动加载。

## 扩展步骤

1. 定义受控JSON参数、字段/长度范围，在validateParameters阶段拒绝非法值。
2. 实现execute，明确业务事务、幂等键和可重试失败，不记录完整用户数据或密钥。
3. 注册Bean，验证重复key启动失败及未注册key保存失败。
4. 管理页读取handlers，创建暂停任务，检查时区/cron和参数后再启用。
5. 手动一次返回fireId，读取SUCCEEDED/FAILED结果；再验证计划触发、并发、misfire和异常恢复。

## 结果与限制

任务持久化成功不代表execute成功。当前调度有持久化fire/认领与状态管理，仍不能保证任何业务副作用“恰好一次”；处理器自己承担幂等。失败摘要保持安全，不能把SQLException或业务正文直接回传。旧invoke_target不作为新任务执行入口。

## 源码依据

`system-admin/src/main/java/com/xinghuiTec/quartz/handler/JobHandler.java`、`NoopJobHandler.java`、`JobHandlerRegistry.java`；`quartz/service/impl/SysJobServiceImpl.java`；验证参考 `system-admin/src/test/java/com/xinghuiTec/quartz/`目录的现有测试。
