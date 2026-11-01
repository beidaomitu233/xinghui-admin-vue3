import { requestClient } from '#/api/request';

export interface OperLogInfo {
  businessAction?: string;
  businessTarget?: null | string;
  businessResult?: string;
  operationSource?: string;
  operId: string;
  title: string;
  businessType: number;
  method: string;
  requestMethod: string;
  operatorType: number;
  operName: string;
  deptName: string;
  operUrl: string;
  operIp: string;
  operLocation: string;
  operParam: string;
  jsonResult: string;
  status: number;
  errorMsg: string;
  costTime: number;
  operTime: string;
}

export interface OperLogListParams {
  businessType?: number;
  operName?: string;
  order: 'asc' | 'desc';
  orderBy:
    | 'businessType'
    | 'costTime'
    | 'operName'
    | 'operTime'
    | 'status'
    | 'title';
  pageNum: number;
  pageSize: number;
  status?: number;
  title?: string;
}

export function getOperLogList(params: OperLogListParams) {
  return requestClient.get<{ records: OperLogInfo[]; total: number | string }>(
    '/monitor/operlog/list',
    { params },
  );
}

export function removeOperLog(operIds: string[]) {
  return requestClient.post('/monitor/operlog/remove', operIds);
}

export function cleanOperLog() {
  return requestClient.post('/monitor/operlog/clean');
}
