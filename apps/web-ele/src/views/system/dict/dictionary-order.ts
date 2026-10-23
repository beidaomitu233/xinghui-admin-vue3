import type { DictItem, DictType } from '#/api/system/dict';

function value(row: DictItem | DictType, field: string) {
  switch (field) {
    case 'code': {
      return 'code' in row ? row.code : undefined;
    }
    case 'enabled': {
      return row.enabled;
    }
    case 'label': {
      return 'label' in row ? row.label : undefined;
    }
    case 'name': {
      return 'name' in row ? row.name : undefined;
    }
    case 'remark': {
      return row.remark;
    }
    case 'sortOrder': {
      return 'sortOrder' in row ? row.sortOrder : undefined;
    }
    case 'value': {
      return 'value' in row ? row.value : undefined;
    }
    default: {
      return undefined;
    }
  }
}
function compareId(left: number | string, right: number | string) {
  const a = BigInt(left);
  const b = BigInt(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
/** API完整返回字典集合，原生表头排序必须处理完整集合及精确ID次序。 */
export function sortDictionaryRows<Row extends DictItem | DictType>(
  rows: Row[],
  field: string,
  order: 'asc' | 'desc' = 'asc',
): Row[] {
  return rows.toSorted((left, right) => {
    const a = value(left, field);
    const b = value(right, field);
    let result = 0;
    if (a === null || a === undefined)
      result = b === null || b === undefined ? 0 : -1;
    else if (b === null || b === undefined) result = 1;
    else if (
      (typeof a === 'number' && typeof b === 'number') ||
      (typeof a === 'boolean' && typeof b === 'boolean')
    )
      result = Number(a) - Number(b);
    else result = String(a).localeCompare(String(b), 'zh-CN');
    return (order === 'asc' ? result : -result) || compareId(left.id, right.id);
  });
}
