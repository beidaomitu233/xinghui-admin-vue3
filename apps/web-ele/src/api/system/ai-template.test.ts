import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setDefinitionEnabled } from './ai-template';

const client = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('#/api/request', () => ({ requestClient: client }));

describe('template and resource enabled requests', () => {
  beforeEach(() => client.request.mockReset());

  it.each(['templates', 'data-resources'] as const)(
    'uses supported generic request for %s with PATCH and a CAS body',
    async (kind) => {
      const id = '9007199254740993';
      const response = { id, revision: 8, enabled: false };
      client.request.mockResolvedValueOnce(response);

      await expect(setDefinitionEnabled(kind, id, 7, false)).resolves.toEqual(
        response,
      );
      expect(client.request).toHaveBeenCalledTimes(1);
      expect(client.request).toHaveBeenCalledWith(
        `/system/ai/${kind}/${id}/enabled`,
        { data: { revision: 7, enabled: false }, method: 'PATCH' },
      );
    },
  );
});
