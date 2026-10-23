import type { Plugin } from 'vite';

import { collectDemoIcons } from './demo-build';

export const LOCAL_ICON_MODULE_ID = 'virtual:xinghui-local-icons';

/** Bundle source icons and the server menu vocabulary; never fetch icons at runtime. */
export function localIconsPlugin(workspace: string): Plugin {
  const id = `\0${LOCAL_ICON_MODULE_ID}`;
  return {
    name: 'xinghui-local-icons',
    resolveId(source) {
      if (source === LOCAL_ICON_MODULE_ID) return id;
    },
    load(source) {
      if (source === id)
        return `export default ${JSON.stringify(collectDemoIcons(workspace))};`;
    },
  };
}
