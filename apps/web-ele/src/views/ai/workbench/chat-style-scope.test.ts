import { afterEach, describe, expect, it } from 'vitest';
import { compileStyle, parse } from 'vue/compiler-sfc';

import source from './index.vue?raw';

let style: HTMLStyleElement | undefined;
let fixture: HTMLDivElement | undefined;
function find(selector: string) {
  const target = fixture?.querySelector(selector);
  if (!target) throw new Error(`Missing fixture: ${selector}`);
  return target;
}
afterEach(() => {
  style?.remove();
  fixture?.remove();
  document.documentElement.classList.remove('dark');
});

describe('chat stylesheet isolation', () => {
  it('styles the user bubble without painting the document or Vben dark layout surfaces', () => {
    const { descriptor } = parse(source);
    const compiled = descriptor.styles.map((block) =>
      compileStyle({
        source: block.content,
        filename: 'index.vue',
        id: 'data-v-hub-scope-test',
        scoped: block.scoped,
      }),
    );
    expect(compiled.flatMap((block) => block.errors)).toEqual([]);
    style = document.createElement('style');
    style.textContent = `
      html, .layout-surface { background: rgb(28, 29, 34); }
      .active-tab { background: rgb(219, 234, 254); }
      ${compiled.map((block) => block.code).join('\n')}
    `;
    document.head.append(style);
    document.documentElement.classList.add('dark');
    fixture = document.createElement('div');
    fixture.innerHTML = `
      <header class="dark layout-surface"></header>
      <aside class="dark layout-surface"></aside>
      <div class="active-tab"></div>
      <div class="hub-chat" data-v-hub-scope-test>
        <div data-role="user"><div class="agentscope-runtime-webui-bubble-content-filled">查询配置</div></div>
      </div>
    `;
    document.body.append(fixture);
    for (const target of [
      document.documentElement,
      find('header'),
      find('aside'),
    ]) {
      expect(getComputedStyle(target).backgroundColor).toBe('rgb(28, 29, 34)');
    }
    expect(getComputedStyle(find('.active-tab')).backgroundColor).toBe(
      'rgb(219, 234, 254)',
    );
    expect(
      getComputedStyle(find('.agentscope-runtime-webui-bubble-content-filled'))
        .borderRadius,
    ).toBe('22px');
  });
});
