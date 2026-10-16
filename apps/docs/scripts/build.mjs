import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { checkContent, checkOutput, docsRoot } from './check.mjs';

const partial = process.argv.includes('--partial');
// A caller's inherited development flag must never turn the standard build into a partial build.
process.env.DOCS_PARTIAL = partial ? '1' : '0';
const checked = await checkContent({ partial });
if (checked.errors.length > 0) throw new Error(checked.errors.join('\n'));
if (checked.deferred.length > 0)
  console.warn(
    `PARTIAL BUILD: ${checked.pageCount} pages; ${checked.deferred.length} required chapters missing. This is not a complete documentation delivery.`,
  );
// VitePress caches its Markdown renderer globally. Keep the checker separate
// from the site build so the actual site's Markdown options are respected.
const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve('vitepress/package.json')),
  'bin/vitepress.js',
);
const built = spawnSync(process.execPath, [cli, 'build', docsRoot], {
  env: process.env,
  stdio: 'inherit',
});
if (built.error) throw built.error;
if (built.status !== 0)
  throw new Error(`Documentation build failed with status ${built.status}`);
const errors = checkOutput(undefined, partial ? { required: ['index'] } : {});
if (errors.length > 0) throw new Error(errors.join('\n'));
process.stdout.write(
  `${
    partial
      ? 'Partial documentation artifact checked; full chapter gate remains pending.'
      : 'Complete documentation build and public artifact scan passed.'
  }\n`,
);
