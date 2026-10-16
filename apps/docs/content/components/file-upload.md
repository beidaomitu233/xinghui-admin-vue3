# 受保护文件上传

本项目现有上传入口是文件管理API与Element Plus上传页面，没有一个自动绑定任意业务实体的“附件字段”组件。接入页面需要 `system:oss:upload`、已启用存储，以及与[文件管理](/features/files)一致的输入校验。

## 函数契约

`uploadFile(file: File, onProgress?: (percent: number) => void): Promise<OssFile>`使用multipart的file字段。仅在浏览器上传事件有total时报告百分比；上传百分比达到100不代表服务端保存成功。

OssFile包含字符串ossId、originalName、fileName、fileSuffix、size、createTime。下载使用 `downloadFile(ossId): Promise<Blob>`，删除使用 `removeFiles(ossIds: string[])`；不要把内部对象地址或accessKey传给浏览器绕过受保护接口。

```ts
import { ref } from 'vue';
import { uploadFile } from '#/api/system/file';

const busy = ref(false);
const percent = ref(0);
export async function uploadSelected(file: File) {
  if (busy.value) return;
  if (file.size === 0 || file.size > 20 * 1024 * 1024) {
    throw new Error('文件必须非空且不超过20MB');
  }
  busy.value = true;
  percent.value = 0;
  try {
    const result = await uploadFile(file, (value) => {
      percent.value = value;
    });
    if (!result.ossId) throw new Error('缺少文件编号');
    return result;
  } finally {
    busy.value = false;
  }
}
```

示例仅展示状态与API，完整业务接入还必须复用文件页后缀白名单并展示失败提示；后端仍校验后缀、内容边界和文件归属。调用失败交给页面保留选择与提供重试，不能在finally报告成功。

## 正常结果与失败

只有响应有ossId才更新业务引用，并重新读取文件信息确认。存储断连、停用或越权应保持原业务值，不改用公开URL兜底。历史文件读取依赖原平台版本配置；更换服务地址和主密钥前先完成恢复安排。

## 源码依据

`apps/web-ele/src/api/system/file.ts`（上传进度、Blob下载）；`apps/web-ele/src/views/system/file/index.vue`（MAX_SIZE、ALLOWED_SUFFIXES、handleUpload）。服务端定位 `system-admin/src/main/java/com/xinghuiTec/controller/SysOssController.java`。
