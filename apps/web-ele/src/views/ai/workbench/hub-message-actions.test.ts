import { describe, expect, it } from 'vitest';

import { editedRequest } from './hub-message-draft';

describe('editing a sent business message', () => {
  it('keeps images in the new submission without changing the historical request', () => {
    const original = {
      input: [
        {
          content: [
            { type: 'text', text: '照图新增' },
            { type: 'image', image_url: 'blob:owned-image' },
          ],
        },
      ],
    };
    const saved = JSON.stringify(original);
    const next = editedRequest(original, '改为35元');
    expect(next.query).toBe('改为35元');
    expect(next.fileList?.[0]?.response).toEqual({ url: 'blob:owned-image' });
    expect(JSON.stringify(original)).toBe(saved);
    expect(editedRequest(original).query).toBe('照图新增');
  });
});
