import type {
  SceneDefinition,
  SceneEditableDefinition,
} from '#/api/system/ai-scene';

import { describe, expect, it, vi } from 'vitest';

import { cloneScene, persistScene } from './scene-save-adapter';

const save = vi.hoisted(() => vi.fn());
vi.mock('#/api/system/ai-scene', () => ({ saveScene: save }));
function definition(): SceneDefinition {
  return {
    name: '订单',
    purpose: '',
    promptText: '{{user_request}}',
    outputRequirement: '',
    dataObjects: [
      { objectKey: 'lowcode.record', formId: '42', fields: ['subject'] },
    ],
    dataBindings: [
      {
        variable: '旧订单',
        label: '原订单',
        sourceKey: 'db.orders',
        mode: 'ROW',
        fields: ['id'],
        filters: [],
        limit: 1,
        row: { currentRecord: false, key: { id: '9007199254740993123' } },
        relation: null,
      },
    ],
    sqlBindings: [
      {
        variable: 'order_total',
        label: '订单金额',
        description: '精确汇总金额',
        datasetKeys: ['orders'],
        query: {
          sql: 'SELECT amount FROM orders_view WHERE id = :id',
          parameters: { id: { $number: '9007199254740993123' }, code: '00123' },
          maxRows: 20,
        },
      },
    ],
    modelPolicy: {
      mode: 'FIXED',
      models: [
        {
          model: { modelRef: 'model-a', configVersion: '1' },
          keyMode: 'FIXED',
          allowedKeys: [],
          fixedKey: { keyRef: 'key-a', keyVersion: '1' },
          fallbackKeys: [{ keyRef: 'key-b', keyVersion: '2' }],
        },
      ],
      fallback: true,
      outputFormat: 'TEXT',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  };
}
describe('prompt-only persistence and immutable data definitions', () => {
  it('copies SQL parameters and old exact keys without shared nested state or numeric conversion', () => {
    const original = definition();
    const copy = cloneScene(original);
    const binding = copy.sqlBindings?.[0];
    if (!binding) throw new Error('Missing binding');
    expect(binding.query.parameters).toEqual({
      id: { $number: '9007199254740993123' },
      code: '00123',
    });
    binding.query.parameters.id = { $number: '2' };
    binding.datasetKeys.push('other');
    expect(original.sqlBindings?.[0]?.query.parameters.id).toEqual({
      $number: '9007199254740993123',
    });
    expect(original.sqlBindings?.[0]?.datasetKeys).toEqual(['orders']);
    expect(copy.dataBindings?.[0]?.row?.key.id).toBe('9007199254740993123');
    expect(copy.modelPolicy).toEqual(original.modelPolicy);
  });
  it('omits routing on body saves while retaining old objects and SQL bindings under the original CAS and nonce', async () => {
    const value = definition();
    const saved = cloneScene(value);
    save.mockResolvedValueOnce({
      clientMutationId: 'mutation-a',
      effectiveFrom: null,
      detail: {
        scene: {
          sceneKey: 'scene.a',
          revision: 5,
          currentVersionId: 'version-5',
        },
        definition: saved,
        legacy: null,
      },
    });
    const onSaved = vi.fn();
    await persistScene(
      {
        sceneKey: 'scene.a',
        expectedRevision: 4,
        clientMutationId: 'mutation-a',
        value,
      },
      onSaved,
    );
    const wire = save.mock.calls.at(-1)?.[1];
    expect(wire.expectedRevision).toBe(4);
    expect(wire.clientMutationId).toBe('mutation-a');
    expect(wire.definition).not.toHaveProperty('modelPolicy');
    expect(wire.definition).not.toHaveProperty('initialModel');
    expect(wire.definition.sqlBindings).toEqual(value.sqlBindings);
    expect(wire.definition.dataBindings).toEqual(value.dataBindings);
    expect(wire.definition.dataObjects).toEqual(value.dataObjects);
    expect(value.modelPolicy.models[0]?.keyMode).toBe('FIXED');
  });
  it('sends only the initial model intent for an unconfigured scene and accepts the server-owned policy', async () => {
    const value = {
      ...definition(),
      initialModel: { modelRef: 'model-new', configVersion: '9' },
    };
    const saved = { ...definition(), initialModel: null };
    save.mockResolvedValueOnce({
      clientMutationId: 'mutation-new',
      effectiveFrom: null,
      detail: {
        scene: {
          sceneKey: 'scene.new',
          revision: 1,
          currentVersionId: 'version-1',
        },
        definition: saved,
        legacy: null,
      },
    });
    const acknowledgement = await persistScene(
      {
        sceneKey: 'scene.new',
        expectedRevision: 0,
        clientMutationId: 'mutation-new',
        value,
      },
      vi.fn(),
    );
    const wire = save.mock.calls.at(-1)?.[1]
      .definition as SceneEditableDefinition;
    expect(wire.initialModel).toEqual(value.initialModel);
    expect(wire).not.toHaveProperty('modelPolicy');
    expect(acknowledgement.value.initialModel).toBeNull();
    expect(acknowledgement.value.modelPolicy).toEqual(saved.modelPolicy);
  });
});
