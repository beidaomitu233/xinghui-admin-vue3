import { addCollection } from '@vben/icons';
import { updatePreferences } from '@vben/preferences';

import collections from 'virtual:xinghui-demo-icons';

import { DEMO_IMAGE } from './seed';

export function setupDemo() {
  for (const collection of collections) addCollection(collection);
  const logo = `${import.meta.env.BASE_URL}favicon.ico`;
  updatePreferences({
    app: { defaultAvatar: DEMO_IMAGE },
    logo: { source: logo, sourceDark: logo },
  });
}
