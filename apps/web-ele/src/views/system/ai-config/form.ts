import type {
  AiConfiguration,
  DraftChange,
} from '#/api/system/ai-configuration';

export interface KeyEditor {
  keyRef?: string;
  label: string;
  mode: 'DB' | 'ENV';
  envName: string;
  apiKey: string;
}
export interface ConfigurationEditor {
  name: string;
  environment: string;
  providerCode: string;
  endpointUrl: string;
  protocol: string;
  timeoutSeconds: number;
  modelCodes: string[];
  jsonObjectModels: string[];
  keys: KeyEditor[];
}
export const newKey = (index: number): KeyEditor => ({
  label: `Key ${index}`,
  mode: 'DB',
  envName: '',
  apiKey: '',
});
export function newEditor(): ConfigurationEditor {
  return {
    name: '',
    environment: 'production',
    providerCode: 'openrouter',
    endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
    protocol: 'OPENAI_CHAT',
    timeoutSeconds: 30,
    modelCodes: [],
    jsonObjectModels: [],
    keys: [newKey(1)],
  };
}
export function fromConfiguration(
  config: AiConfiguration,
): ConfigurationEditor {
  return {
    name: config.name,
    environment: config.environment,
    providerCode: config.providerCode,
    endpointUrl: config.draft.endpointUrl,
    protocol: config.draft.protocol,
    timeoutSeconds: config.draft.timeoutSeconds,
    modelCodes: config.draft.models.map((m) => m.modelCode),
    jsonObjectModels: config.draft.models
      .filter((m) => m.jsonObject === true)
      .map((m) => m.modelCode),
    keys: config.draft.keys.map((k) => ({
      keyRef: k.keyRef,
      label: k.label,
      mode: k.mode,
      envName: k.envName ?? '',
      apiKey: '',
    })),
  };
}
export function toDraft(
  editor: ConfigurationEditor,
  original?: AiConfiguration,
): DraftChange {
  return {
    revision: original?.revision ?? 0,
    name: editor.name.trim() || `${editor.providerCode} ${editor.environment}`,
    environment: editor.environment.trim(),
    providerCode: editor.providerCode,
    endpointUrl: editor.endpointUrl,
    protocol: editor.protocol,
    timeoutSeconds: editor.timeoutSeconds,
    models: editor.modelCodes.map((code) => ({
      modelCode: code.trim(),
      jsonObject: editor.jsonObjectModels.includes(code),
      modelRef: original?.draft.models.find((m) => m.modelCode === code.trim())
        ?.modelRef,
    })),
    keys: editor.keys.map((k, index) => ({
      keyRef: k.keyRef,
      label: k.label.trim() || `Key ${index + 1}`,
      mode: k.mode,
      envName: k.mode === 'ENV' ? k.envName.trim() : null,
      apiKey: k.mode === 'DB' ? k.apiKey.trim() : '',
    })),
  };
}
export function pastedKeys(value: string, offset: number): KeyEditor[] {
  return value
    .split(/\r?\n/)
    .map((key) => key.trim())
    .filter(Boolean)
    .map((apiKey, index) => ({ ...newKey(offset + index + 1), apiKey }));
}
