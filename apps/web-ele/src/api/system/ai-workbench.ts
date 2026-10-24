import { requestClient } from '#/api/request';

export interface AgentPreset {
  sceneKey: string;
  name: string;
}
export interface AgentSession {
  id: string;
  title: string;
  activeRunId: null | string;
  version: string;
  updatedAt: string;
}
export type AgentRunStatus =
  | 'CANCELLED'
  | 'CANCELLING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INTERRUPTED'
  | 'QUEUED'
  | 'RUNNING';
export interface AgentRun {
  id: string;
  sessionId: string;
  status: AgentRunStatus;
  sceneKey: string;
  errorCode: null | string;
  deadline: string;
}
export interface AgentEvent {
  id: string;
  runId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}
export interface AgentSubmission {
  input: string;
  sceneKey: string;
  clientRequestId: string;
}
export interface AgentAdmission {
  created: boolean;
  run: AgentRun;
}
const base = '/system/ai/workbench';
const segment = (id: string) => encodeURIComponent(id);
export const listAgentPresets = () =>
  requestClient.get<AgentPreset[]>(`${base}/presets`);
export const listAgentSessions = () =>
  requestClient.get<AgentSession[]>(`${base}/sessions`);
export const createAgentSession = (title: string) =>
  requestClient.post<AgentSession>(`${base}/sessions`, { title });
export const getAgentSession = (id: string) =>
  requestClient.get<AgentSession>(`${base}/sessions/${segment(id)}`);
export const renameAgentSession = (
  id: string,
  title: string,
  expectedVersion: string,
) =>
  requestClient.put<AgentSession>(`${base}/sessions/${segment(id)}`, {
    title,
    expectedVersion,
  });
export const getAgentEvents = (id: string, after: string) =>
  requestClient.get<AgentEvent[]>(`${base}/sessions/${segment(id)}/events`, {
    params: { after },
  });
export const submitAgentRun = (id: string, data: AgentSubmission) =>
  requestClient.post<AgentAdmission>(
    `${base}/sessions/${segment(id)}/runs`,
    data,
  );
export const getAgentRun = (id: string) =>
  requestClient.get<AgentRun>(`${base}/runs/${segment(id)}`);
export const cancelAgentRun = (id: string) =>
  requestClient.post<AgentRun>(`${base}/runs/${segment(id)}/cancel`, {});
