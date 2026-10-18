import type { SaveCommand } from './ordered-autosave';

import type { DatabaseValue, DataBinding } from '#/api/system/ai-database';
import type {
  SceneDefinition,
  SceneEditableDefinition,
  SceneSaveResult,
} from '#/api/system/ai-scene';

import { saveScene } from '#/api/system/ai-scene';

import { SaveProblem } from './ordered-autosave';

function cloneData(value: DatabaseValue): DatabaseValue {
  if (Array.isArray(value)) return value.map((value) => cloneData(value));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneData(item)]),
    );
  return value;
}
export function cloneDataBinding(binding: DataBinding): DataBinding {
  return {
    ...binding,
    fields: [...binding.fields],
    filters: binding.filters.map((filter) => ({
      ...filter,
      value: cloneData(filter.value),
    })),
    row: binding.row
      ? {
          currentRecord: binding.row.currentRecord,
          key: Object.fromEntries(
            Object.entries(binding.row.key).map(([key, value]) => [
              key,
              cloneData(value),
            ]),
          ),
        }
      : null,
    relation: binding.relation ? { ...binding.relation } : null,
  };
}

/** Copies the wire definition, including nested arrays, without retaining Vue proxies. */
export function cloneScene(value: SceneDefinition): SceneDefinition {
  return {
    ...value,
    ...(value.sqlBindings
      ? {
          sqlBindings: value.sqlBindings.map((binding) => ({
            ...binding,
            datasetKeys: [...binding.datasetKeys],
            query: {
              ...binding.query,
              parameters: Object.fromEntries(
                Object.entries(binding.query.parameters).map(([key, item]) => [
                  key,
                  cloneData(item),
                ]),
              ),
            },
          })),
        }
      : {}),
    ...(value.dataBindings
      ? {
          dataBindings: value.dataBindings.map((binding) =>
            cloneDataBinding(binding),
          ),
        }
      : {}),
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
        const path = object(field).field;
        const name =
          typeof path === 'string' ? path.replace(/^definition\./, '') : path;
        if (
          typeof name === 'string' &&
          /^(?:name|purpose|promptText|outputRequirement|dataObjects|dataBindings|sqlBindings|initialModel|businessModel|modelPolicy)(?:\.\w+|\[\d{1,3}\])*$/.test(
            name,
          )
        ) {
          const root = name.split(/[.[]/, 1)[0];
          const labels: Record<string, string> = {
            name: '场景名称',
            purpose: '用途',
            promptText: '提示词',
            outputRequirement: '输出规则',
            sqlBindings: '查询引用',
            initialModel: '使用模型',
            businessModel: '使用模型',
            dataObjects: '数据对象或允许字段',
            dataBindings: '数据库引用',
            modelPolicy: '模型及调用设置',
          };
          if (root) fields[root] = `${labels[root]}配置不符合要求，请检查。`;
        }
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
    const definition: SceneEditableDefinition = { ...command.value };
    delete definition.modelPolicy;
    if (definition.businessModel || !definition.initialModel)
      delete definition.initialModel;
    const result = await saveScene(command.sceneKey, {
      clientMutationId: command.clientMutationId,
      confirmedLegacyConversion,
      definition,
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
