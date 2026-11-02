// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderAgentMarkdown } from './markdown';

describe('agent Markdown output', () => {
  it('renders business result tables, code, lists and Chinese text', () => {
    const html = renderAgentMarkdown(
      '## 结果\n\n| 名称 | 价格 |\n|---|---|\n| QA纸杯 | 0 |\n\n- `available`: **false**',
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<td>QA纸杯</td>');
    expect(html).toContain('<code>available</code>');
    expect(html).toContain('<strong>false</strong>');
  });

  it('keeps an incomplete streamed fence inert', () => {
    const html = renderAgentMarkdown('```html\n<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script');
  });

  it('removes scriptable HTML, automatic remote resources and unsafe links', () => {
    const html = renderAgentMarkdown(
      '<script>alert(1)</script><img src="https://example.invalid/track" onerror="alert(2)"><iframe src="https://example.invalid"></iframe><svg onload="alert(3)"></svg><form action="https://example.invalid"><input name="password"></form>\n\n[bad](javascript:alert%281%29) [good](https://example.invalid)',
    );
    expect(html).not.toMatch(/<(?:script|img|iframe|svg|form|input)\b/i);
    expect(html).not.toMatch(/onerror|onload|javascript:/i);
    expect(html).toContain('href="https://example.invalid"');
  });
});
