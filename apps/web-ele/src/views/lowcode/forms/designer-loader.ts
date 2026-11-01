import type { App } from 'vue';

import FcDesigner from '@form-create/designer';
import ElementPlus from 'element-plus';

const installed = new WeakSet<App>();
/** Loaded only when the business designer is opened. */
export function installDesigner(app: App) {
  if (!installed.has(app)) {
    if (!app.component('ElForm') || !app.component('ElContainer'))
      app.use(ElementPlus);
    app.use(FcDesigner);
    app.use(FcDesigner.formCreate);
    installed.add(app);
  }
  return FcDesigner;
}
