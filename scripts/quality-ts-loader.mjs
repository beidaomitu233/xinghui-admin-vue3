import { readFile } from 'node:fs/promises';

import ts from 'typescript';

// Only the existing node:test cases need TS erasure. Project typecheck remains a separate required job.
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
    };
  }
  return nextLoad(url, context);
}
