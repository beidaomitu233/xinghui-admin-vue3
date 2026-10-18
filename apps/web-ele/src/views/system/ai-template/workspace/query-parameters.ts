import type { DatabaseValue } from '#/api/system/ai-database';

/** Numeric JSON lexemes become C's exact decimal envelope before JSON.parse can round them. */
export function readQueryParameters(
  text: string,
): Record<string, DatabaseValue> {
  if (!text.trimStart().startsWith('{'))
    throw new Error('Parameters must be an object');
  let rewritten = '';
  let quoted = false;
  let escaped = false;
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?/iy;
  for (let index = 0; index < text.length; ) {
    const character = text[index] ?? '';
    if (quoted) {
      rewritten += character;
      index++;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      rewritten += character;
      index++;
      continue;
    }
    if (character === '-' || /\d/.test(character)) {
      number.lastIndex = index;
      const match = number.exec(text);
      if (match) {
        rewritten += `{"$number":${JSON.stringify(match[0])}}`;
        index += match[0].length;
        continue;
      }
    }
    rewritten += character;
    index++;
  }
  const value: unknown = JSON.parse(rewritten);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 32
  )
    throw new Error('Invalid parameters');
  return value as Record<string, DatabaseValue>;
}

function exactValue(value: DatabaseValue, depth = 0): DatabaseValue {
  if (depth > 64) throw new Error('Parameter nesting exceeds limit');
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value))
      throw new Error('Server parameter must use exact numeric encoding');
    return { $number: String(value) };
  }
  if (Array.isArray(value))
    return value.map((item) => exactValue(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        exactValue(item, depth + 1),
      ]),
    );
  return value;
}
export function queryParameterText(value: Record<string, DatabaseValue>) {
  return JSON.stringify(exactValue(value), null, 2);
}
