import type { RequestResponse } from '@vben/request';

import { createDemoTransport } from './transport';

export function demoAdapter(config: RequestResponse['config']) {
  return createDemoTransport(window.localStorage)(config);
}
