import type { ConversationItem, ConversationMessage } from './view-model';

import type {
  ConversationSummary,
  PersistedConversationMessage,
} from '#/api/system/ai-conversation';

import { aiErrorMessage } from '#/api/system/ai-runtime-errors';

export function conversationItem(value: ConversationSummary): ConversationItem {
  let state: ConversationItem['state'] = 'idle';
  if (['QUEUED', 'RUNNING'].includes(value.status)) state = 'replying';
  else if (value.status === 'CANCELLED') state = 'cancelled';
  else if (['FAILED', 'INCOMPLETE', 'TIMED_OUT'].includes(value.status))
    state = 'failed';
  return {
    key: value.conversationId,
    title: value.title || '未命名对话',
    sceneKey: value.sceneKey,
    sceneLabel: value.sceneName,
    sourceLabel: value.sourceLabel,
    excerpt: value.lastMessage,
    updatedAt: value.updatedAt,
    state,
  };
}
export function conversationMessage(
  value: PersistedConversationMessage,
): ConversationMessage {
  let state: ConversationMessage['state'] = 'complete';
  if (value.role === 'ASSISTANT') {
    if (value.status === 'CANCELLED') state = 'cancelled';
    else if (['QUEUED', 'RUNNING'].includes(value.status)) state = 'pending';
    else if (value.partial) state = 'partial';
    else if (value.status !== 'SUCCEEDED') state = 'failed';
  }
  return {
    key: value.messageId,
    role: value.role === 'USER' ? 'user' : 'assistant',
    body: value.content,
    createdAt: value.createdAt,
    state,
    failure:
      value.role === 'ASSISTANT' && value.errorCode
        ? aiErrorMessage(value.errorCode)
        : undefined,
  };
}
