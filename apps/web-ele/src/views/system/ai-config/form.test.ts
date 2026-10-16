import type { AiConfiguration } from '#/api/system/ai-configuration';

import { describe, expect, it } from 'vitest';

import { fromConfiguration, newEditor, pastedKeys, toDraft } from './form';

const saved: AiConfiguration = {
  id: '9007199254740993001',
  name: 'Existing',
  environment: 'test',
  providerCode: 'openrouter',
  status: 'ACTIVE',
  revision: 3,
  activeVersion: '12',
  latestTestId: null,
  updatedAt: '',
  legacyModelId: null,
  activePairs: [],
  draft: {
    configVersion: '13',
    providerCode: 'openrouter',
    endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
    protocol: 'OPENAI_CHAT',
    timeoutSeconds: 30,
    models: [{ modelRef: '9007199254740993002', modelCode: 'unit/model' }],
    keys: [
      {
        keyRef: '9007199254740993003',
        keyVersion: '15',
        label: 'Key 1',
        mode: 'DB',
        envName: null,
      },
    ],
  },
};
describe('aI configuration form contracts', () => {
  it('keeps old snapshots text-only and preserves an explicit JSON choice in the saved model', () => {
    const form = fromConfiguration(saved);
    expect(form.jsonObjectModels).toEqual([]);
    expect(toDraft(form, saved).models[0]?.jsonObject).toBe(false);
    form.jsonObjectModels = ['unit/model'];
    const changed = toDraft(form, saved);
    expect(changed.models[0]).toMatchObject({
      modelRef: '9007199254740993002',
      jsonObject: true,
    });
    const reloaded = fromConfiguration({
      ...saved,
      draft: {
        ...saved.draft,
        models: [
          {
            modelRef: '9007199254740993002',
            modelCode: 'unit/model',
            jsonObject: true,
          },
        ],
      },
    });
    expect(reloaded.jsonObjectModels).toEqual(['unit/model']);
  });
  it('keeps exact IDs and leaves existing secret blank so empty edits retain server material', () => {
    const form = fromConfiguration(saved);
    expect(form.keys[0]?.apiKey).toBe('');
    const draft = toDraft(form, saved);
    expect(draft.revision).toBe(3);
    expect(draft.models[0]?.modelRef).toBe('9007199254740993002');
    expect(draft.keys[0]).toMatchObject({
      keyRef: '9007199254740993003',
      apiKey: '',
    });
    form.keys.splice(0, 1);
    expect(toDraft(form, saved).keys).toEqual([]);
    expect(saved.draft.keys).toHaveLength(1);
  });
  it('handles multiline paste once and generates editable configuration and key labels', () => {
    const form = newEditor();
    form.keys = pastedKeys('first\r\n\n second \n', 0);
    const draft = toDraft(form);
    expect(draft.name).toBe('openrouter production');
    expect(draft.keys.map((key) => [key.label, key.apiKey])).toEqual([
      ['Key 1', 'first'],
      ['Key 2', 'second'],
    ]);
    const first = form.keys[0];
    if (!first) throw new Error('Expected pasted key');
    first.mode = 'ENV';
    first.envName = 'AI_TEST_KEY';
    expect(toDraft(form).keys[0]).toMatchObject({
      mode: 'ENV',
      envName: 'AI_TEST_KEY',
      apiKey: '',
    });
  });
});
