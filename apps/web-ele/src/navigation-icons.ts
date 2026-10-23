import { iconLoaded } from '@vben/icons';

// Vocabulary used by the permission-filtered backend menus. The build bundles
// these official Iconify assets together with icons referenced in source code.
export const navigationIcons = [
  'carbon:activity',
  'carbon:api',
  'carbon:application',
  'carbon:application-web',
  'carbon:apps',
  'carbon:bot',
  'carbon:catalog',
  'carbon:chat-bot',
  'carbon:cics-sit',
  'carbon:collapse-categories',
  'carbon:cube',
  'carbon:dashboard',
  'carbon:data-class',
  'carbon:data-table',
  'carbon:document',
  'carbon:document-configuration',
  'carbon:download',
  'carbon:flag',
  'carbon:folder',
  'carbon:home',
  'carbon:machine-learning',
  'carbon:menu',
  'carbon:notebook',
  'carbon:notification',
  'carbon:qr-code',
  'carbon:settings',
  'carbon:time',
  'carbon:user',
  'carbon:user-role',
];

/** Unknown, missing or external menu images get a recognizable local icon. */
export function navigationIcon(icon: unknown, directory = false) {
  const legacy: Record<string, string> = {
    'carbon:data-viewer': 'carbon:data-table',
    'carbon:dictionary': 'carbon:notebook',
    'carbon:form': 'carbon:document',
  };
  if (typeof icon === 'string' && legacy[icon]) return legacy[icon];
  if (typeof icon === 'string' && iconLoaded(icon)) return icon;
  return directory ? 'carbon:folder' : 'carbon:application';
}
