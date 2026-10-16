import { requestClient } from '#/api/request';

export interface JobInfo {
  jobId: string;
  jobName: string;
  jobGroup: string;
  handlerKey: null | string;
  handlerParams: string;
  cronExpression: string;
  timeZone: string;
  nextFireTime: null | string;
  misfirePolicy: string;
  concurrent: string;
  status: string;
  createBy: string;
  createTime: string;
  updateBy: string;
  updateTime: string;
  remark: string;
}

export interface JobChangePayload {
  jobId?: string;
  jobName: string;
  jobGroup: string;
  handlerKey: string;
  handlerParams: string;
  cronExpression: string;
  timeZone: string;
  misfirePolicy: '2' | '3';
  concurrent: '0' | '1';
  status: '0' | '1';
  remark: string;
}

export interface JobFire {
  fireId: string;
  triggerType: 'MANUAL' | 'SCHEDULED';
  scheduledFireTime: null | string;
  status: 'CANCELLED' | 'CLAIMED' | 'FAILED' | 'SKIPPED' | 'SUCCEEDED';
  attemptCount: number;
  startedAt: null | string;
  completedAt: null | string;
  resultSummary: null | string;
}

export function getJobList(params: Record<string, unknown>) {
  return requestClient.get<{
    records: JobInfo[];
    rows?: JobInfo[];
    total: number | string;
  }>('/monitor/job/list', { params });
}

export function getJob(jobId: number | string) {
  return requestClient.get<JobInfo>(`/monitor/job/${jobId}`);
}

export function addJob(data: JobChangePayload) {
  return requestClient.post<string>('/monitor/job', data);
}

export function updateJob(data: JobChangePayload) {
  return requestClient.put('/monitor/job', data);
}

export function removeJob(jobIds: string) {
  return requestClient.delete(`/monitor/job/${jobIds}`);
}

export function getJobHandlers() {
  return requestClient.get<string[]>('/monitor/job/handlers');
}

export function getJobFires(jobId: number | string) {
  return requestClient.get<JobFire[]>(`/monitor/job/${jobId}/fires`);
}

export function runJob(jobId: number | string) {
  return requestClient.post<string>(`/monitor/job/${jobId}/run`);
}

export function changeJobStatus(jobId: number | string, status: '0' | '1') {
  return requestClient.put(`/monitor/job/${jobId}/status`, { status });
}
