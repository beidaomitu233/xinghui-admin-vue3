import type { KeyReference, ModelBinding } from '#/api/system/ai-application';
import type { SceneModelPolicy } from '#/api/system/ai-scene';

export type RouteKeyOption = { key: KeyReference; maskedLabel: string };
export const routeModelId = (model: ModelBinding['model']) =>
  `${model.modelRef}:${model.configVersion}`;
export const routeKeyId = (key: KeyReference) =>
  `${key.keyRef}:${key.keyVersion}`;
export const copyRoute = (policy: SceneModelPolicy): SceneModelPolicy => ({
  ...policy,
  models: policy.models.map((binding) => ({
    ...binding,
    model: { ...binding.model },
    allowedKeys: binding.allowedKeys.map((key) => ({ ...key })),
    fixedKey: binding.fixedKey ? { ...binding.fixedKey } : null,
    fallbackKeys: binding.fallbackKeys.map((key) => ({ ...key })),
  })),
});
export function routeKeyChoices(
  binding: ModelBinding,
  available: RouteKeyOption[],
) {
  const options = [...available];
  for (const key of [
    ...binding.allowedKeys,
    ...binding.fallbackKeys,
    ...(binding.fixedKey ? [binding.fixedKey] : []),
  ])
    if (!options.some((option) => routeKeyId(option.key) === routeKeyId(key)))
      options.push({ key, maskedLabel: '已保存 Key（当前不可用）' });
  return options;
}
export function routeSelectedKeys(
  binding: ModelBinding,
  available: RouteKeyOption[],
) {
  if (binding.keyMode === 'FIXED')
    return [binding.fixedKey, ...binding.fallbackKeys].flatMap((key) =>
      key ? [routeKeyId(key)] : [],
    );
  return (
    binding.allowedKeys.length > 0
      ? binding.allowedKeys
      : available.map((option) => option.key)
  ).map((key) => routeKeyId(key));
}
export function replaceRouteKeys(
  binding: ModelBinding,
  keys: KeyReference[],
): ModelBinding {
  if (binding.keyMode === 'FIXED')
    return {
      ...binding,
      fixedKey: keys[0] ?? null,
      fallbackKeys: keys.slice(1),
    };
  return { ...binding, allowedKeys: keys };
}
