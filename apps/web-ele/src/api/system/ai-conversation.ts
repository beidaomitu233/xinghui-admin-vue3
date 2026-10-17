import type { AiRestLong, RequestStatus } from './ai-application';
import type { SceneSubmission } from './ai-scene';

import { requestClient } from '#/api/request';

export interface ConversationTestSelection {
  confirmedCosts: boolean;
  expectedSceneRevision: number;
  modelIndex: number;
}
export interface ConversationStart {
  businessRef: SceneSubmission['businessRef'];
  clientMutationId: string;
  kind: 'BUSINESS' | 'TEST';
  message: string;
  sceneKey: string;
  test: ConversationTestSelection | null;
}
export interface ConversationContinue {
  clientMutationId: string;
  expectedRevision: number;
  message: string;
  test: ConversationTestSelection | null;
}
export interface ConversationSummary {
  businessRef: SceneSubmission['businessRef'];
  canContinue: boolean;
  conversationId: string;
  history: 'COMPLETE' | 'LEGACY_NO_BODY';
  kind: 'BUSINESS' | 'TEST';
  lastMessage: string;
  revision: number;
  sceneKey: string;
  sceneName: string;
  sourceLabel: string;
  status: RequestStatus;
  title: string;
  updatedAt: string;
}
export interface PersistedConversationMessage {
  content: string;
  createdAt: string;
  errorCode: null | string;
  finishedAt: null | string;
  messageId: string;
  partial: boolean;
  requestId: string;
  role: 'ASSISTANT' | 'USER';
  sceneVersionId: string;
  sequence: AiRestLong;
  status: RequestStatus;
}
export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: PersistedConversationMessage[];
  notice: null | string;
}
export interface ConversationPage {
  pageNum: number;
  pageSize: number;
  records: ConversationSummary[];
  total: string;
}
export interface ConversationAccepted {
  assistantMessageId: string;
  contextStartMessageId: null | string;
  contextTruncated: boolean;
  conversationId: string;
  requestId: string;
  revision: number;
  sceneVersionId: string;
  status: RequestStatus;
  userMessageId: string;
}
export type ConversationScope = 'AUDIT' | 'OWN';
const base = '/ai/conversations';
export const listConversations = (params: {
  pageNum: number;
  pageSize: number;
  requestKind?: 'BUSINESS' | 'TEST';
  sceneKey?: string;
  scope: ConversationScope;
  search?: string;
}) => requestClient.get<ConversationPage>(base, { params });
export const getConversation = (
  conversationId: string,
  scope: ConversationScope = 'OWN',
) =>
  requestClient.get<ConversationDetail>(
    `${base}/${encodeURIComponent(conversationId)}`,
    { params: { scope } },
  );
export const startConversation = (input: ConversationStart) =>
  requestClient.post<ConversationAccepted>(base, input);
export const continueConversation = (
  conversationId: string,
  input: ConversationContinue,
) =>
  requestClient.post<ConversationAccepted>(
    `${base}/${encodeURIComponent(conversationId)}/messages`,
    input,
  );
