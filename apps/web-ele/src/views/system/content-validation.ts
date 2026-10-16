/** No content value is interpreted as executable HTML or JavaScript. */
export function safeContentUrl(value: string, optional = false): boolean {
  const url = value.trim();
  if (!url) return optional;
  if (
    /[\\\s]/u.test(url) ||
    [...url].some(
      (character) =>
        (character.codePointAt(0) ?? 128) < 32 ||
        (character.codePointAt(0) ?? 128) === 127,
    ) ||
    url.startsWith('//')
  )
    return false;
  if (url.startsWith('/')) return true;
  if (!/^https?:\/\//u.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
