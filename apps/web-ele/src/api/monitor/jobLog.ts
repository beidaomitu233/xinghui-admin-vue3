import { requestClient } from '#/api/request';

/** Safe sys_job_fire projection; legacy sys_job_log text is never returned. */
export interface JobFireLog {
  fireId: string;
  jobId: string;
  jobName: null | string;
  jobGroup: null | string;
  triggerType: 'MANUAL' | 'SCHEDULED';
  scheduledFireTime: null | string;
  status: 'CANCELLED' | 'CLAIMED' | 'FAILED' | 'SKIPPED' | 'SUCCEEDED';
  attemptCount: number;
  startedAt: null | string;
  completedAt: null | string;
  resultSummary: null | string;
  traceId: null | string;
}

export interface JobFirePage {
  records: JobFireLog[];
  total: number | string;
  pageNum: number;
  pageSize: number;
}

export interface JobFireFilters {
  pageNum: number;
  pageSize: number;
  jobId?: string;
  jobName?: string;
  status?: string;
  triggerType?: string;
}

export function getJobLogList(params: JobFireFilters) {
  return requestClient.get<JobFirePage>('/monitor/jobLog/list', { params });
}

export function getJobLog(fireId: string) {
  return requestClient.get<JobFireLog>(`/monitor/jobLog/${fireId}`);
}

export function removeJobLog(ids: string) {
  return requestClient.delete<number>(`/monitor/jobLog/${ids}`);
}

export function cleanJobLog() {
  return requestClient.delete<number>('/monitor/jobLog/clean');
}
