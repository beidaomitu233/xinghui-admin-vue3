import type {
  AiSettingsChange,
  AiSettingsView,
  SettingsKeyView,
} from '#/api/system/ai-settings';

export interface ChannelKeyDraft {
  apiKey: string;
  keyConfigured: boolean;
  keyId?: string;
  localId: string;
  maskedKey: string;
  modelCodes: string[];
  name: string;
}
export interface ChannelDraft {
  endpointUrl: string;
  keys: ChannelKeyDraft[];
  name: string;
  provider: string;
}
export function channelKey(
  index: number,
  value?: SettingsKeyView,
): ChannelKeyDraft {
  return {
    localId: crypto.randomUUID(),
    keyId: value?.keyId,
    name: value?.name ?? `Key ${index}`,
    apiKey: '',
    keyConfigured: value?.keyConfigured ?? false,
    maskedKey: value?.maskedKey ?? '',
    modelCodes: [...(value?.modelCodes ?? [])],
  };
}
export function channelDraft(value?: AiSettingsView): ChannelDraft {
  return {
    name: value?.name ?? '',
    provider: value?.provider ?? 'openrouter',
    endpointUrl:
      value?.endpointUrl ?? 'https://openrouter.ai/api/v1/chat/completions',
    keys: value
      ? (value.keys ?? []).map((key, index) => channelKey(index + 1, key))
      : [channelKey(1)],
  };
}
export function channelMetadata(value: ChannelDraft) {
  return JSON.stringify({
    name: value.name,
    provider: value.provider,
    endpointUrl: value.endpointUrl,
    keys: value.keys.map((key) => ({
      keyId: key.keyId,
      name: key.name,
      modelCodes: key.modelCodes,
    })),
  });
}
export function channelError(value: ChannelDraft): string {
  if (!value.name.trim()) return '请填写渠道名称。';
  if (value.keys.length === 0 || value.keys.length > 16)
    return '每个渠道需保留 1 到 16 个 Key。';
  for (const key of value.keys) {
    if (!key.name.trim()) return '请为每个 Key 填写名称。';
    if (!key.keyConfigured && !key.apiKey.trim())
      return `请填写「${key.name}」的 API Key。`;
    if (key.modelCodes.length === 0) return `请为「${key.name}」选择模型。`;
  }
  if (new Set(value.keys.flatMap((key) => key.modelCodes)).size > 16)
    return '每个渠道最多选择 16 个不同模型。';
  if (value.keys.reduce((total, key) => total + key.modelCodes.length, 0) > 64)
    return '每个渠道最多保留 64 组 Key 与模型关联。';
  return '';
}
export function channelPayload(
  value: ChannelDraft,
  original?: AiSettingsView,
  clientMutationId?: string,
): AiSettingsChange {
  return {
    clientMutationId,
    expectedRevision: original?.revision ?? null,
    name: value.name.trim(),
    provider: value.provider,
    endpointUrl: value.endpointUrl,
    modelCodes: [...new Set(value.keys.flatMap((key) => key.modelCodes))],
    keys: value.keys.map((key) => ({
      keyId: key.keyId,
      name: key.name.trim(),
      apiKey: key.apiKey.trim() || null,
      modelCodes: [...key.modelCodes],
    })),
  };
}
