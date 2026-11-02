# 文件上传

使用 `src/api/system/file.ts` 的 `uploadFile` 上传，业务保存返回的文件 ID。详情和下载使用 `getFileInfo`、`downloadFile`。

上传区展示文件名、进度、失败重试和删除动作。文件 ID 使用字符串，避免长整型精度丢失。

先配置对象存储，再接入业务表单。图片任务通过中台附件接口上传，不在提示词中嵌入服务端凭据。
