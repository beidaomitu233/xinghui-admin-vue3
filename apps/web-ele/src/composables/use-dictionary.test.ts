import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDictLabel, getDictOptions } from '#/api/system/dict';

import { DICT_TYPE, useDictionary } from './use-dictionary';

vi.mock('#/api/system/dict', () => ({
  getDictOptions: vi.fn(),
  getDictLabel: vi.fn(),
}));

describe('business dictionary adapter', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses enabled options for selection and resolves disabled historical labels', async () => {
    vi.mocked(getDictOptions).mockResolvedValue([
      { value: '1', label: '通知卡片', sortOrder: 10 },
    ]);
    vi.mocked(getDictLabel).mockImplementation(async (_code, value) => ({
      value,
      label: value === '2' ? '强弹窗' : value,
      known: value === '2',
      enabled: false,
    }));

    const dict = useDictionary(DICT_TYPE.NOTICE_TYPE);
    await dict.load();
    await dict.ensureLabels(['2', 'unknown']);

    expect(getDictOptions).toHaveBeenCalledWith('notice_type');
    expect(dict.options.value.map((item) => item.value)).toEqual(['1']);
    expect(dict.label('2')).toBe('强弹窗');
    expect(dict.label('unknown')).toBe('unknown');
  });

  it('exposes loading failure and supports retry for task status', async () => {
    vi.mocked(getDictOptions)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([
        { value: '0', label: '启用配置', sortOrder: 10 },
      ]);
    const dict = useDictionary(DICT_TYPE.JOB_STATUS);

    await dict.load();
    expect(dict.error.value).toBe(true);
    expect(dict.options.value).toEqual([]);
    await dict.load();
    expect(dict.error.value).toBe(false);
    expect(dict.label('0')).toBe('启用配置');
    expect(dict.label('9')).toBe('9');
  });

  it('refreshes a disabled historical label after reloading options', async () => {
    vi.mocked(getDictOptions).mockResolvedValue([
      { value: '1', label: '通知卡片', sortOrder: 10 },
    ]);
    vi.mocked(getDictLabel)
      .mockResolvedValueOnce({
        value: '2',
        label: '旧名称',
        known: true,
        enabled: false,
      })
      .mockResolvedValueOnce({
        value: '2',
        label: '新名称',
        known: true,
        enabled: false,
      });

    const dict = useDictionary(DICT_TYPE.NOTICE_TYPE);
    await dict.load();
    await dict.ensureLabels(['2']);
    expect(dict.label('2')).toBe('旧名称');
    await dict.load();
    expect(dict.label('2')).toBe('新名称');
    expect(getDictLabel).toHaveBeenCalledTimes(2);
  });
});
