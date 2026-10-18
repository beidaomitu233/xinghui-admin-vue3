import type { HubModel, HubModelChange } from '#/api/system/ai-model-hub';

export type ModelMetadata = Pick<
  HubModelChange,
  'capabilities' | 'contextWindow' | 'enabled' | 'name' | 'slug'
>;
export interface HubSourceOption {
  code: string;
  name: string;
  capabilities: string;
  contextWindow: string;
}

export function hubModelChange(
  model: HubModel,
): Omit<HubModelChange, 'clientMutationId'> {
  return {
    expectedRevision: model.revision,
    name: model.name,
    slug: model.slug,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    enabled: model.enabled,
    strategy: model.strategy,
    fallback: model.fallback,
    routes: model.routes.map((route) => ({
      routeId: route.routeId,
      channelId: route.channelId,
      upstreamModel: route.upstreamModel,
      enabled: route.enabled,
    })),
  };
}
export function mutationStatus(error: unknown) {
  const status = (error as { response?: { status?: unknown } })?.response
    ?.status;
  return typeof status === 'number' ? status : undefined;
}
export function hubMutationMessage(error: unknown) {
  const status = mutationStatus(error);
  if (status === 409) return '配置已有变化，请重新读取后再修改。';
  if (status === 403) return '当前没有此项配置权限。';
  if (status === 404) return '配置已不存在或当前不可读取。';
  if (status === 400 || status === 422)
    return '保存未通过，请检查调用名称、模型与供应商配置。';
  return '保存结果尚未确认，可重试原请求或重新读取状态。';
}
