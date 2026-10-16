import { ref, shallowRef } from 'vue';

export interface PageData<Row> {
  records: Row[];
  total: number | string;
}

export interface PageQuery {
  order: 'asc' | 'desc';
  orderBy: string;
  pageNum: number;
  pageSize: number;
}

export function parsePage<Row>(value: PageData<Row>): {
  records: Row[];
  total: number;
} {
  const rawTotal = value?.total;
  const total =
    typeof rawTotal === 'string' && rawTotal.trim() === ''
      ? Number.NaN
      : Number(rawTotal);
  if (
    !Array.isArray(value?.records) ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new Error('分页响应格式错误');
  }
  return { records: value.records, total };
}

export function usePagedList<Row, Filters extends object>(options: {
  fetch: (query: Filters & PageQuery) => Promise<PageData<Row>>;
  filters: Filters;
  orderBy: string;
  pageSize?: number;
}) {
  const records = shallowRef<Row[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const error = ref('');
  const pageNum = ref(1);
  const pageSize = ref(options.pageSize ?? 10);
  const order = ref<'asc' | 'desc'>('desc');
  let requestId = 0;

  async function load() {
    const currentRequest = ++requestId;
    loading.value = true;
    error.value = '';
    try {
      const response = await options.fetch({
        ...options.filters,
        order: order.value,
        orderBy: options.orderBy,
        pageNum: pageNum.value,
        pageSize: pageSize.value,
      });
      if (currentRequest !== requestId) return false;
      const page = parsePage(response);
      records.value = page.records;
      total.value = page.total;
      return true;
    } catch {
      if (currentRequest !== requestId) return false;
      records.value = [];
      total.value = 0;
      error.value = '列表加载失败，请重试';
      return false;
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  function search() {
    pageNum.value = 1;
    return load();
  }

  function reset(resetFilters: () => void) {
    resetFilters();
    return search();
  }

  function setSort(value: 'ascending' | 'descending' | null) {
    order.value = value === 'ascending' ? 'asc' : 'desc';
    return search();
  }

  function setPage(value: number) {
    pageNum.value = value;
    return load();
  }

  function setPageSize(value: number) {
    pageSize.value = value;
    return search();
  }

  function reloadAfterDelete(deletedCount: number) {
    if (records.value.length <= deletedCount && pageNum.value > 1) {
      pageNum.value--;
    }
    return load();
  }

  return {
    error,
    load,
    loading,
    order,
    pageNum,
    pageSize,
    records,
    reloadAfterDelete,
    reset,
    search,
    setPage,
    setPageSize,
    setSort,
    total,
  };
}
