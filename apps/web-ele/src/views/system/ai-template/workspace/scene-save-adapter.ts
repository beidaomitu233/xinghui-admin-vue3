import type { SaveCommand } from './ordered-autosave';

import type { SceneDefinition, SceneSaveResult } from '#/api/system/ai-scene';

import { saveScene } from '#/api/system/ai-scene';

import { SaveProblem } from './ordered-autosave';

/** Copies the wire definition, including nested arrays, without retaining Vue proxies. */
export function cloneScene(value: SceneDefinition): SceneDefinition {
  return {
    ...value,
    dataObjects: value.dataObjects.map((item) => ({
      ...item,
      fields: [...item.fields],
    })),
    modelPolicy: {
      ...value.modelPolicy,
      models: value.modelPolicy.models.map((item) => ({
        ...item,
        model: { ...item.model },
        allowedKeys: item.allowedKeys.map((key) => ({ ...key })),
        fixedKey: item.fixedKey ? { ...item.fixedKey } : null,
        fallbackKeys: item.fallbackKeys.map((key) => ({ ...key })),
      })),
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
export function sceneSaveProblem(error: unknown) {
  const response = object(object(error).response);
  const status = response.status;
  if (status === 409)
    return new SaveProblem('conflict', '版本已变化，本地输入已保留。');
  if (status === 401 || status === 403)
    return new SaveProblem('denied', '当前无编辑权限，本地输入已保留。');
  if (status === 400 || status === 422) {
    const data = object(object(response.data).data);
    const fields: Record<string, string> = {};
    if (Array.isArray(data.fields))
      for (const field of data.fields) {
        const name = object(field).field;
        if (
          typeof name === 'string' &&
          /^(?:name|purpose|promptText|outputRequirement|dataObjects|modelPolicy)(?:\.[\w.]+)?$/.test(
            name,
          )
        )
          fields[name] = '此项配置不符合要求，请检查。';
      }
    return new SaveProblem(
      'validation',
      '配置未通过校验，原有效配置继续使用。',
      fields,
    );
  }
  return new SaveProblem('unavailable', '保存失败，本地输入已保留，请重试。');
}
export async function persistScene(
  command: SaveCommand<SceneDefinition>,
  onSaved: (result: SceneSaveResult) => void,
  confirmedLegacyConversion = false,
) {
  try {
    const result = await saveScene(command.sceneKey, {
      clientMutationId: command.clientMutationId,
      confirmedLegacyConversion,
      definition: command.value,
      expectedRevision: command.expectedRevision,
    });
    if (
      result.clientMutationId !== command.clientMutationId ||
      result.detail.scene.sceneKey !== command.sceneKey ||
      !result.detail.definition ||
      !result.detail.scene.currentVersionId ||
      !Number.isSafeInteger(result.detail.scene.revision) ||
      result.detail.scene.revision <= command.expectedRevision
    )
      throw new Error('Invalid save acknowledgement');
    const confirmed = cloneScene(result.detail.definition);
    onSaved(result);
    return {
      revision: result.detail.scene.revision,
      value: confirmed,
    };
  } catch (error) {
    throw sceneSaveProblem(error);
  }
}
