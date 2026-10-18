import type { ModelReference } from './ai-application';
import type { QueryContext, QueryDiagnostic, SqlQuery } from './ai-query';

import { requestClient } from '#/api/request';

export type SqlAssistanceStatus =
  | 'CANCELLED'
  | 'FAILED'
  | 'INCOMPLETE'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'TIMED_OUT'
  | 'VALIDATING';
export interface SqlAssistanceStart extends QueryContext {
  businessModel?: null | string;
  sceneKey: string;
  expectedSceneRevision: number;
  description: string;
  initialModel: ModelReference | null;
  expectedSchemaFingerprint: string;
  confirmedCosts: boolean;
  clientMutationId: string;
  maxRows: number;
}
export interface SqlAssistanceAccepted {
  requestId: string;
  status: SqlAssistanceStatus;
  scopeDescription: string;
  schemaFingerprint: string;
}
export interface SqlAssistanceView extends SqlAssistanceAccepted {
  query: null | SqlQuery;
  diagnostics: QueryDiagnostic[];
  errorCode: null | string;
  deadline: string;
}
const base = '/ai/scenes/sql-assistance';
export const startSqlAssistance = (input: SqlAssistanceStart) =>
  requestClient.post<SqlAssistanceAccepted>(base, input);
export const getSqlAssistance = (id: string) =>
  requestClient.get<SqlAssistanceView>(`${base}/${encodeURIComponent(id)}`);
export const cancelSqlAssistance = (id: string) =>
  requestClient.post<unknown>(`${base}/${encodeURIComponent(id)}/cancel`, {});
