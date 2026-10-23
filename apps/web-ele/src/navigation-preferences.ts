import { localDefaultAsset } from './local-assets';

/** Upgrade only the old navigation setting; keep themes, tabs and login storage. */
export function migrateNavigationPreferences(
  namespace: string,
  storage: Storage = localStorage,
) {
  const marker = `${namespace}-navigation-v1`;
  try {
    if (storage.getItem(marker) === '1') return false;
    const key = `${namespace}-preferences`;
    const raw = storage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached?.value && typeof cached.value === 'object') {
        cached.value.navigation = {
          ...cached.value.navigation,
          accordion: false,
        };
        if (typeof cached.value.app?.defaultAvatar === 'string')
          cached.value.app.defaultAvatar = localDefaultAsset(
            cached.value.app.defaultAvatar,
            'avatar',
          );
        if (typeof cached.value.logo?.source === 'string')
          cached.value.logo.source = localDefaultAsset(
            cached.value.logo.source,
            'logo',
          );
        storage.setItem(key, JSON.stringify(cached));
      }
    }
    storage.setItem(marker, '1');
  } catch {
    /* A blocked/full storage must not prevent login or navigation. */
  }
  return true;
}
