import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const override = 'apps/web-ele/.env.production.local';
assert.ok(
  !existsSync(override),
  'Refuse to overwrite a personal runtime override',
);
try {
  // dotenv local is passed to the existing build even with Turbo strict environment mode.
  writeFileSync(override, 'VITE_GLOB_API_URL=/api\nVITE_NITRO_MOCK=false\n');
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=@vben/web-ele',
      '--force',
      '--concurrency=1',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=2048',
      },
      shell: process.platform === 'win32',
    },
  );
  assert.equal(result.status, 0, 'Production build failed');
  const source = readFileSync('apps/web-ele/dist/_app.config.js', 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  const configs = Object.values(sandbox.window).filter(
    (value) =>
      value && typeof value === 'object' && 'VITE_GLOB_API_URL' in value,
  );
  assert.equal(
    configs.length,
    1,
    'Missing/ambiguous built runtime configuration',
  );
  assert.equal(
    configs[0].VITE_GLOB_API_URL,
    '/api',
    'Built runtime must use same-origin API',
  );
  assert.ok(
    !source.includes('mock-napi.vben.pro'),
    'Upstream mock runtime rejected',
  );
  console.log('Production runtime _app.config.js verified: same-origin /api');
} finally {
  if (existsSync(override)) unlinkSync(override);
}
