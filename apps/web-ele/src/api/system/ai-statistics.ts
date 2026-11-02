import type { CallLogFilters } from './ai-call-log';

import { requestClient } from '#/api/request';

export type MetricValue = null | number | string;
export type MetricRow = Record<string, MetricValue>;
export interface AiAnalytics {
  totals: MetricRow;
  costs: MetricRow[];
  trend: MetricRow[];
  models: MetricRow[];
  modelCosts: MetricRow[];
  providers: MetricRow[];
  scenes: MetricRow[];
  errors: MetricRow[];
}
const base = '/system/ai/call-logs';
export const getAiAnalytics = (params: CallLogFilters) =>
  requestClient.get<AiAnalytics>(`${base}/analytics`, { params });
export const getAiFeedback = (id: string, params: CallLogFilters) =>
  requestClient.get<{ comment?: string; score?: number }>(
    `${base}/${encodeURIComponent(id)}/feedback`,
    { params },
  );
export const rateAiOutput = (
  id: string,
  data: { comment?: string; score: number },
  params: CallLogFilters,
) =>
  requestClient.put(`${base}/${encodeURIComponent(id)}/feedback`, data, {
    params,
  });
