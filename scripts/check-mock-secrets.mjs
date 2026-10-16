import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import ts from 'typescript';

const source = readFileSync(
  new URL('../apps/backend-mock/utils/jwt-utils.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
function load(environment) {
  const context = vm.createContext({
    Buffer,
    exports: {},
    process: { env: environment },
    require: () => ({}),
  });
  vm.runInContext(compiled, context, { timeout: 1000 });
}
const neutral = 'oss04_neutral_mock_fixture_key_32_bytes';
assert.throws(() => load({}), /ACCESS_TOKEN_SECRET requires an explicit key/);
assert.throws(
  () => load({ ACCESS_TOKEN_SECRET: 'short', REFRESH_TOKEN_SECRET: neutral }),
  /ACCESS_TOKEN_SECRET requires an explicit key/,
);
assert.throws(
  () => load({ ACCESS_TOKEN_SECRET: neutral }),
  /REFRESH_TOKEN_SECRET requires an explicit key/,
);
assert.throws(
  () => load({ ACCESS_TOKEN_SECRET: neutral, REFRESH_TOKEN_SECRET: 'short' }),
  /REFRESH_TOKEN_SECRET requires an explicit key/,
);
assert.doesNotThrow(() =>
  load({ ACCESS_TOKEN_SECRET: neutral, REFRESH_TOKEN_SECRET: neutral }),
);
console.log(
  'Actual mock module: missing/short access and refresh keys rejected; explicit neutral keys accepted (5 checks, no JWT generated)',
);
