import { requestClient } from '#/api/request';

export type ExtensionKind = 'KNOWLEDGE' | 'MCP' | 'SKILL';
export interface ExtensionConfig {
  content?: string;
  permission?: string;
  url?: string;
  transport?: string;
  headerName?: string;
  tools?: string[];
  allowWrites?: boolean;
  provider?: string;
  datasetId?: string;
  topK?: number;
}
export interface AgentExtension {
  id: string;
  kind: ExtensionKind;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  config: ExtensionConfig;
  secretSet: boolean;
  version: number;
}
export interface McpTool {
  name: string;
  description: string;
  readOnly: boolean;
  inputSchema: unknown;
}
export type ExtensionDraft = Omit<
  AgentExtension,
  'id' | 'secretSet' | 'version'
> & {
  clearSecret?: boolean;
  id?: string;
  secret?: string;
  secretSet?: boolean;
  version?: number;
};
const base = '/system/ai/extensions';
export const listAgentExtensions = () =>
  requestClient.get<AgentExtension[]>(base);
export const saveAgentExtension = (draft: ExtensionDraft) =>
  requestClient.post<AgentExtension>(base, draft);
export const discoverMcpTools = (id: string) =>
  requestClient.post<McpTool[]>(`${base}/${encodeURIComponent(id)}/tools`);
