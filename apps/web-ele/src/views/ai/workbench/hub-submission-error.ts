import { aiErrorMessage, aiFailureInfo } from '#/api/system/ai-runtime-errors';

export class HubSubmissionError extends Error {
  constructor(public code: 'AGENT_PROMPT_UNAVAILABLE' | 'INVALID_MESSAGE') {
    super(aiErrorMessage(code));
  }
}
/** Admission did not start a model run. Finish the native UI stream with a safe error. */
export function submissionFailureResponse(error: unknown): Response {
  const code =
    error instanceof HubSubmissionError
      ? error.code
      : aiFailureInfo(error).code || 'AGENT_UNAVAILABLE';
  const failure = {
    id: crypto.randomUUID(),
    object: 'response',
    status: 'failed',
    output: [],
    error: { code, message: aiErrorMessage(code) },
  };
  return new Response(`data: ${JSON.stringify(failure)}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
