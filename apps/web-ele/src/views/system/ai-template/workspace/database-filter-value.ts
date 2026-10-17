import type { DatabaseValue } from '#/api/system/ai-database';

/** Numeric identifiers and exact decimals must survive parameterized queries unchanged. */
export function databaseFilterValue(type: string, text: string): DatabaseValue {
  if (/^(?:bool|boolean)\b/i.test(type)) return text === 'true';
  if (
    /^(?:tinyint|smallint|mediumint|int|integer|bigint|number)\b/i.test(type) &&
    /^-?\d+$/.test(text)
  ) {
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : text;
  }
  return text;
}
