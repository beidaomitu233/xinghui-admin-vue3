import type { SceneDefinition } from '#/api/system/ai-scene';

/** Reads old instructions without emitting a save. The first actual edit preserves them in one document. */
export function promptDocument(
  value: Pick<SceneDefinition, 'outputRequirement' | 'promptText'>,
) {
  return value.outputRequirement
    ? `${value.promptText}\n\n输出要求：\n${value.outputRequirement}`
    : value.promptText;
}
export function singlePromptDocument(value: SceneDefinition): SceneDefinition {
  return { ...value, promptText: promptDocument(value), outputRequirement: '' };
}
