# 文件管理

入口为 **通用能力 → 文件管理**。列表支持按原始名称、后缀查询，以及上传、下载和确认删除。文件 ID、size在前端契约中是字符串，避免大整数精度丢失。

## 身份与前置

分别检查 `system:oss:list/upload/download/remove/query`。当前文件列表与单文件读取按createBy限定为本人文件，开启租户后还联合当前tenant；不能把同租户他人或其他租户的ossId当作下载凭证。存储必须已由部署者或业务配置启用；上传失败不代表可以绕过权限改用裸对象地址。

## 上传与下载

1. 查询列表，确认当前筛选范围和选中文件。
2. 上传一个非空、不超过20MB的文件。界面支持 csv、doc/docx、gif、jpeg/jpg、pdf、png、ppt/pptx、txt、webp、xls/xlsx、zip后缀。
3. 观察上传进度。返回 `ossId` 后才报告成功，并重读列表；请求进行中禁止再次上传。
4. 下载通过受保护接口取得Blob，再由浏览器保存。删除单个或多个文件均有确认；批量删除前核对选中的ID。

```ts
import { uploadFile } from '#/api/system/file';

async function submitFile(file: File) {
  return uploadFile(file, (percent) => {
    // 更新页面进度；不要把文件内容写入控制台。
    void percent;
  });
}
```

## 正常结果与恢复

上传响应包含 `ossId/originalName/fileName/fileSuffix/size/createTime`，列表重读仍能找到文件。浏览器校验只是第一层，服务端继续校验大小、后缀、名称和访问范围。存储停用、桶不可用、权限不足时不应假报成功。下载失败先检查登录和文件范围，再检查历史存储配置；不能擅自更换主密钥。删除失败重读列表确认现状后再操作。

当前页面不是通用表单附件组件；低代码没有附件字段，不能把文件管理按钮写成低代码上传能力。

## 源码依据

- 前端：`apps/web-ele/src/views/system/file/index.vue`、`apps/web-ele/src/api/system/file.ts`、`apps/web-ele/src/views/system/file/file-size.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/SysOssController.java`。
- 运行时平台：`common/common-oss/src/main/java/com/xinghuiTec/oss/config/OssRuntimeSettings.java`。
