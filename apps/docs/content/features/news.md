# 资讯管理

入口为 **通用能力 → 资讯管理**（`/system/news`）。平台身份及 `system:news:list/query/add/edit/remove`控制操作。当前保留资讯CRUD，没有恢复网站配置、导航、Banner、下载或页面管理模块。

## 操作步骤

1. 按标题和状态查询，使用分页查看结果。
2. 新增标题、摘要、正文、封面地址、分类、标签JSON和状态。
3. 打开详情核对正文与时间；编辑后保存并重读，不能仅凭关闭弹窗判断写入成功。
4. 删除先确认，成功后重读列表。

状态为0发布、1草稿、2下架；新增默认草稿。发布状态设置publishTime，下架/草稿按服务规则调整时间。tags是JSON字符串，按页面要求填写数组，不填写JavaScript表达式。

```json
{
  "title": "产品更新说明",
  "summary": "介绍本次界面调整",
  "content": "正文作为纯文本保存。",
  "coverImage": "",
  "category": "updates",
  "tags": "[\"产品\"]",
  "status": "1"
}
```

## 正常结果与恢复

新建返回字符串ID，详情使用该ID读回；分页每页最多100条，不能把ID转成JS Number。正文在当前页面以文本呈现，不把存储的HTML/Markdown自动执行。封面地址经过URL规则验证，非法协议或含凭据URL拒绝。

保存失败保留输入；字段错误修改后重试，列表错误提供重新读取。无数据是正常空态，权限拒绝不是空态。当前资讯页没有revision字段，不应把低代码/AI的CAS请求格式直接复用到资讯接口。

## 源码依据

- 前端：`apps/web-ele/src/views/system/news/index.vue`、`apps/web-ele/src/views/system/content-validation.ts`、`apps/web-ele/src/api/system/news.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/content/ContentService.java`（`NewsChange`、`createNews`、`updateNews`）。
- 用资讯作为新模块的参考见[模块扩展](/development/module-extension)。
