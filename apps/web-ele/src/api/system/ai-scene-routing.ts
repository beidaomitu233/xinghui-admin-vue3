import type { SceneModelPolicy } from './ai-scene';

import { requestClient } from '#/api/request';

export interface SceneRoutingView {
  sceneKey: string;
  revision: number;
  currentVersionId: null | string;
  modelPolicy: null | SceneModelPolicy;
}
export interface SceneRoutingChange {
  expectedRevision: number;
  clientMutationId: string;
  modelPolicy: SceneModelPolicy;
}
export interface SceneRoutingSaved {
  routing: SceneRoutingView;
  clientMutationId: string;
  effectiveFrom: null | string;
}
const path = (sceneKey: string) =>
  `/system/ai/settings/scene-routes/${encodeURIComponent(sceneKey)}`;
export const getSceneRouting = (sceneKey: string) =>
  requestClient.get<SceneRoutingView>(path(sceneKey));
export const saveSceneRouting = (sceneKey: string, input: SceneRoutingChange) =>
  requestClient.put<SceneRoutingSaved>(path(sceneKey), input);
