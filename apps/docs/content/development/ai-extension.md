# 开发 Agent 业务工具

把已有业务服务注册为 `AgentResourceProvider`，Agent 就能发现、理解和调用它。页面和工具共用业务校验、权限与事务。

## 1. 实现资源提供者

在 `system-admin` 的业务模块注册 Spring Bean：

```java
@Component
public class ProductAgentResources implements AgentResourceProvider {
    private final ProductService products;
    public ProductAgentResources(ProductService products) { this.products = products; }
    public String namespace() { return "products"; }
    public JsonNode catalog(AgentCall call) { /* 返回资源名称与用途 */ }
    public JsonNode describe(AgentCall call, String resource) { /* 返回字段与动作 */ }
    public JsonNode query(AgentCall call, String resource, JsonNode args) { /* 调用查询服务 */ }
    public JsonNode mutate(AgentCall call, String resource, JsonNode args) { /* 调用写入服务 */ }
    public void requireReadable(AgentActor actor, String resource) { /* 校验当前访问权限 */ }
}
```

这是接口结构示例；返回值按业务 DTO 构造。已有完整例子：`NativeAdminAgentResources`、`LowcodeAgentResources`、`ExternalKnowledgeResources`。

## 2. 提供可理解的描述

`catalog` 只列当前用户可用资源；`describe` 提供字段类型、必填项、可查询条件和业务动作。例如商品除了新增、修改，还可提供上架、调价、库存调整等动作。

```json
{
  "resource": "products:catalog",
  "name": "商品",
  "operations": ["query", "create", "changePrice", "publish"],
  "fields": { "name": "商品名", "price": "售价", "stock": "库存" }
}
```

## 3. 复用业务服务

查询和变更都使用 `AgentAccess` 提供的当前身份，调用现有服务。需要预览和确认的变更接入已有变更网关；参考 `LowcodeAgentResources` 的实现。

不要让模型填写 Java 类名或 SQL 来替代业务接口。工具参数描述清楚，用户只需说业务需求。

## 4. 在中台验证

给测试账号分配角色，打开工具列表确认能力出现。输入“查看在售商品”，再验证一项有预览的修改操作。检查对话结果、业务数据和 AI 请求明细。

## 5. 用 Skill 复用流程

在中台设置中添加 Skill，描述该业务的处理顺序和判断方法。Skill 引导步骤，工具负责执行。已有外部服务可直接通过 [MCP](../ai/extensions.md) 接入。
