// @vitest-environment node
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';

import { RequestClient } from '@vben/request';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestClient } from '#/api/request';

import { downloadFile, getFileInfo, removeFiles, uploadFile } from './file';

vi.mock('#/api/request', () => ({
  requestClient: {
    get: vi.fn(),
    post: vi.fn(),
    upload: vi.fn(),
  },
}));

describe('oss file ID contract', () => {
  const largeId = '9007199254740993';

  beforeEach(() => vi.clearAllMocks());

  it('sends the exact string ID for deletion', async () => {
    await removeFiles([largeId]);
    expect(requestClient.post).toHaveBeenCalledWith('/system/oss/remove', [
      largeId,
    ]);
  });

  it('keeps the exact ID in detail and download URLs', async () => {
    await getFileInfo(largeId);
    await downloadFile(largeId);
    expect(requestClient.get).toHaveBeenCalledWith(
      `/system/oss/info/${largeId}`,
    );
    expect(requestClient.get).toHaveBeenCalledWith(
      `/system/oss/download/${largeId}`,
      { responseType: 'blob', responseReturn: 'body' },
    );
  });

  it('uses the multipart upload helper with a file field', async () => {
    const file = new File(['hello'], 'check.txt', { type: 'text/plain' });
    await uploadFile(file);
    expect(requestClient.upload).toHaveBeenCalledWith(
      '/system/oss/upload',
      { file },
      expect.objectContaining({ onUploadProgress: expect.any(Function) }),
    );
  });

  it('sends multipart bytes with a boundary over HTTP', async () => {
    let contentType = '';
    let body = '';
    const server = createServer(async (request, response) => {
      contentType = String(request.headers['content-type']);
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) chunks.push(chunk);
      body = Buffer.concat(chunks).toString('utf8');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const client = new RequestClient();
      client.instance.defaults.adapter = 'http';
      const file = new File(['multipart-check'], 'check.txt', {
        type: 'text/plain',
      });
      await client.upload(`http://127.0.0.1:${address.port}/upload`, { file });
      expect(contentType).toMatch(/^multipart\/form-data; boundary=.+/);
      expect(body).toContain('name="file"; filename="check.txt"');
      expect(body).toContain('multipart-check');
    } finally {
      server.close();
    }
  });
});
