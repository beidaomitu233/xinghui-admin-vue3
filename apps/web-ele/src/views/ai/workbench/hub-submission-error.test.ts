import { describe, expect, it } from 'vitest';

import {
  HubSubmissionError,
  submissionFailureResponse,
} from './hub-submission-error';

describe('native admission failure completion', () => {
  it('ends the native stream as failed with a specific message instead of leaving the spinner active', async () => {
    const response = submissionFailureResponse(
      new HubSubmissionError('INVALID_MESSAGE'),
    );
    const text = await response.text();
    const frame = JSON.parse(text.replace(/^data: /, ''));
    expect(frame.status).toBe('failed');
    expect(frame.error.code).toBe('INVALID_MESSAGE');
    expect(frame.error.message).not.toContain('请选择Agent提示词');
    expect(frame.error.message).toContain('任务内容');
  });
  it('extracts only a known server error code and never exposes response bodies or credentials', async () => {
    const response = submissionFailureResponse({
      response: {
        data: { message: 'INVALID_MESSAGE', secret: 'private-provider-key' },
      },
    });
    const text = await response.text();
    expect(text).toContain('INVALID_MESSAGE');
    expect(text).not.toContain('private-provider-key');
    expect(
      await submissionFailureResponse(new Error('private-provider-key')).text(),
    ).not.toContain('private-provider-key');
  });
});
