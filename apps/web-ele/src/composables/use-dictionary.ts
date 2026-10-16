import type { DictOption } from '#/api/system/dict';

import { ref } from 'vue';

import { getDictLabel, getDictOptions } from '#/api/system/dict';

export const DICT_TYPE = {
  NOTICE_TYPE: 'notice_type',
  JOB_STATUS: 'job_status',
} as const;

/** Business dictionary reads only. Disabled values remain visible through labels. */
export function useDictionary(code: string) {
  const options = ref<DictOption[]>([]);
  const loading = ref(false);
  const error = ref(false);
  const labels = ref<Record<string, string>>({});
  let requestId = 0;

  async function load() {
    const currentRequest = ++requestId;
    loading.value = true;
    error.value = false;
    try {
      const result = await getDictOptions(code);
      if (currentRequest !== requestId) return;
      const historicalValues = Object.keys(labels.value).filter(
        (value) => !result.some((item) => item.value === value),
      );
      options.value = result;
      labels.value = Object.fromEntries(
        result.map((item) => [item.value, item.label]),
      );
      await ensureLabels(historicalValues, currentRequest);
    } catch {
      if (currentRequest !== requestId) return;
      options.value = [];
      error.value = true;
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  async function ensureLabels(
    values: Array<null | number | string | undefined>,
    generation = requestId,
  ) {
    const missing = [
      ...new Set(
        values
          .map((value) => String(value ?? ''))
          .filter((value) => value && !(value in labels.value)),
      ),
    ];
    await Promise.all(
      missing.map(async (value) => {
        try {
          const result = await getDictLabel(code, value);
          if (generation === requestId) labels.value[value] = result.label;
        } catch {
          // Keep the raw-value fallback; a later read may retry this label.
        }
      }),
    );
  }

  function label(value: null | number | string | undefined) {
    const key = String(value ?? '');
    return labels.value[key] ?? key;
  }

  return { options, loading, error, load, ensureLabels, label };
}
