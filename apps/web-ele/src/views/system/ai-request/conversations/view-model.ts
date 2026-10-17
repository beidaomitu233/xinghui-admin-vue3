/** Presentation models only. HTTP adapters must map the separately frozen B contract. */
export interface ConversationItem {
  excerpt: string;
  key: string;
  sceneKey: string;
  sceneLabel: string;
  sourceLabel: string;
  state: 'cancelled' | 'failed' | 'idle' | 'replying';
  title: string;
  updatedAt: string;
}
export interface ConversationMessage {
  body: string;
  createdAt: string;
  failure?: string;
  key: string;
  role: 'assistant' | 'user';
  state: 'cancelled' | 'complete' | 'failed' | 'partial' | 'pending';
}
export interface ConversationScene {
  key: string;
  label: string;
}
export interface ConversationDraft {
  conversationKey: null | string;
  sceneKey: string;
  text: string;
  token: string;
}
export interface ConversationAcceptance {
  conversationKey: string;
}
export class ConversationSendFailure extends Error {
  constructor(
    public outcome: 'rejected' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}
export function conversationTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '时间未知';
}
