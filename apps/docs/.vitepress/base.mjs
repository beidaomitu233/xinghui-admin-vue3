import process from 'node:process';

/** A build-time pathname, never an origin, query, encoded path or relative URL. */
export function resolveDocsBase(value = process.env.DOCS_BASE) {
  if (value === undefined) return '/docs/';
  if (
    typeof value !== 'string' ||
    value.length > 200 ||
    !/^\/(?:[\w-]+\/)*$/.test(value)
  ) {
    throw new Error(
      'DOCS_BASE must be an absolute pathname with leading/trailing slashes and plain ASCII path segments',
    );
  }
  return value;
}
