import { requestClient } from '#/api/request';

export interface OssFile {
  ossId: string;
  originalName: string;
  fileName: string;
  fileSuffix: string;
  size: string;
  createTime: string;
}

export interface OssPage {
  records: OssFile[];
  total: number | string;
}

export interface OssListParams {
  pageNum: number;
  pageSize: number;
  originalName?: string;
  fileSuffix?: string;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

export function getFileList(params: OssListParams) {
  return requestClient.get<OssPage>('/system/oss/list', { params });
}

export function uploadFile(file: File, onProgress?: (percent: number) => void) {
  return requestClient.upload<OssFile>(
    '/system/oss/upload',
    { file },
    {
      onUploadProgress: (event) => {
        if (event.total)
          onProgress?.(Math.round((event.loaded / event.total) * 100));
      },
    },
  );
}

export function removeFiles(ossIds: string[]) {
  return requestClient.post('/system/oss/remove', ossIds);
}

export function downloadFile(ossId: string) {
  return requestClient.get<Blob>(`/system/oss/download/${ossId}`, {
    responseType: 'blob',
    responseReturn: 'body',
  });
}

export function getFileInfo(ossId: string) {
  return requestClient.get<OssFile>(`/system/oss/info/${ossId}`);
}
