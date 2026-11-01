import type { IAgentScopeRuntimeWebUIInputData } from '@agentscope-ai/chat';

export interface RequestData {
  input: { content: { image_url?: string; text?: string; type: string }[] }[];
}
export function editedRequest(
  data: RequestData,
  query?: string,
): IAgentScopeRuntimeWebUIInputData {
  const content = data.input.flatMap((item) => item.content);
  return {
    query:
      query ??
      content
        .filter((item) => item.type === 'text')
        .map((item) => item.text || '')
        .join('\n'),
    fileList: content
      .filter((item) => item.type === 'image' && item.image_url)
      .map((item, index) => ({
        uid: `edit-${index}`,
        name: `图片${index + 1}.png`,
        type: 'image/png',
        status: 'done' as const,
        response: { url: item.image_url },
      })),
  };
}
