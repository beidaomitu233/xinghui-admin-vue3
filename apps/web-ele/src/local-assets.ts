export const localAvatar = `${import.meta.env.BASE_URL}images/avatar.svg`;
export const localLogo = `${import.meta.env.BASE_URL}images/logo.svg`;

export function localDefaultAsset(value: string, kind: 'avatar' | 'logo') {
  const legacy = `https://unpkg.com/@vbenjs/static-source@0.1.7/source/${kind}-v1.webp`;
  if (value !== legacy) return value;
  return kind === 'avatar' ? localAvatar : localLogo;
}
