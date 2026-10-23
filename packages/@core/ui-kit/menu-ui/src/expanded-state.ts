export function readExpandedMenus(
  key: string,
  allowed?: string[],
): null | string[] {
  if (!key) return null;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (
      !Array.isArray(saved) ||
      !saved.every((item) => typeof item === 'string')
    )
      return null;
    return [...new Set(saved)]
      .filter(
        (path) => path.startsWith('/') && (!allowed || allowed.includes(path)),
      )
      .slice(0, 256);
  } catch {
    return null;
  }
}
export function saveExpandedMenus(key: string, paths: string[]) {
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify([...new Set(paths)].slice(0, 256)),
    );
  } catch {
    /* Storage is optional; in-memory navigation remains usable. */
  }
}
