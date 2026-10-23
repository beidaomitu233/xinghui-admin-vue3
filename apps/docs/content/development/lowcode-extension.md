# 低代码Schema与记录扩展

面向需要维护现有表单系统的开发者。当前使用元数据/版本/JSON记录三表，以及分享配置、提交去重两表，不为每张表单执行DDL。新增能力应同时修改Schema、服务、运行控件、API类型和测试，不能只往设计器加一个选项。

## 现有协议

Schema是fields数组；Field定义fieldKey、label、type、required、defaultValue、options、help、maxLength、min/max、listVisible、searchable。保存草稿后发布不可变版本，Record带schemaVersion/revision/data。记录creator仅记录创建者，权限范围是当前tenant+form+record，不是creator等于当前用户。

```ts
import type { FormSchema } from '#/api/lowcode/forms';

export const exampleSchema: FormSchema = {
  fields: [
    {
      fieldKey: 'subject',
      label: '主题',
      type: 'text',
      required: true,
      defaultValue: null,
      options: [],
      help: '填写中性主题',
      maxLength: 200,
      min: null,
      max: null,
      listVisible: true,
      searchable: true,
    },
  ],
};
```

这是配置数据示例，不会发布或填写任何真实表单。ID响应保持字符串；revision/schemaVersion/maxLength为严格整数，不能提交1.5让后端截断。

## 扩展步骤

1. 定义新类型的JSON表示、默认值、required空值语义、大小/范围，以及历史版本兼容策略。
2. 在LowcodeSchema校验type/默认值/记录数据并规范化缺省属性，保持256KiB边界和系统字段拒绝。
3. 在前端FormField类型、form-schema验证、设计器和RuntimeFields实现相同规则，添加显示/查询行为；不可查询的复杂类型明确禁用searchable。
4. LowcodeService继续使用不可变版本和CAS，现存记录按其原版本编辑；发布不能删除/改型曾使用字段，含软删除历史。
5. 查询仅接受已发布Schema声明的可查字段，JSON路径与值绑定，不拼用户SQL；新索引/结构需要新迁移，不改V160。
6. 测试七种既有类型回归、新类型错误、默认/空值、兼容发布、旧记录、跨tenant/form、整数、并发和保存失败保留。

## 权限与失败恢复

设计Controller检查平台身份和lowcode:form动作；runtime允许record五种动作任一种读取已发布schema，但列表/详情/新增/编辑/删除仍各自授权。打开填写路由不等于有新增权限；记录页面list权限也不自动包含query/edit。

新提交只接收最新published schemaVersion；停用拒绝新增，历史编辑仍允许。冲突时保留输入/草稿并重新读取，不能用清空记录或删版本来规避兼容性。附件、联动、公式仍不在当前实现范围。

## 源码依据

前端 `apps/web-ele/src/api/lowcode/forms.ts`、`views/lowcode/form-schema.ts`、`views/lowcode/RuntimeFields.vue`；后端 `system-admin/src/main/java/com/xinghuiTec/lowcode/LowcodeSchema.java`、`LowcodeService.java`、`LowcodeFormController.java`、`LowcodeRecordController.java`。迁移与原schema读取见V160和相邻测试目录。

## 分享填写协议

`GET/PUT /lowcode/forms/{formId}/sharing`要求平台身份与发布权限，独立revision并发控制。默认关闭，login/public模式；服务端随机令牌，存查找哈希和可恢复密文。保留部署主密钥；撤销、轮换、模式变化和停用使旧链接失效。

仅`GET/POST /lowcode/fill/{token}`允许匿名进入。GET只返回title、schemaVersion、accessMode、fields。POST只接受schemaVersion、requestKey、data；拒绝客户端归属字段，回执不返回ID或答案。登录模式重查账号和租户，公开模式按分享配置归属；链接不授予记录管理权限。

锁顺序为表单→分享；提交事务显式READ_COMMITTED，重查令牌、启用状态、版本和账号。去重账本与记录同事务，同键同内容返回原回执，不同内容409。只有确认重新加载且GET成功后才更换提交键，普通失败重试保留。扩展时保持真实MySQL并发屏障测试覆盖发布、撤销、模式变化及同键竞争。

独立页使用普通fetch与明确401/403/409/410状态，不因匿名页401清理其他管理会话；主动登录或切换账号才清理旧会话，保留返回地址。新增资源不能向外部发送包含令牌的地址。
