import type { MenuInfo } from '#/api/system/menu';

const fields = new Set(['menuName', 'orderNum', 'perms', 'component', 'status', 'createTime']);

function compareId(left: string, right: string) {
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) return left.localeCompare(right);
  const a = BigInt(left);
  const b = BigInt(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 只排同级节点；相同值始终以精确Long ID稳定排序，不打散父子上下文。 */
export function sortMenuSiblings(
  nodes: MenuInfo[],
  field = 'orderNum',
  order: 'asc' | 'desc' = 'asc',
): MenuInfo[] {
  const key = (fields.has(field) ? field : 'orderNum') as keyof MenuInfo;
  return nodes.toSorted((left, right) => {
    const a = left[key];
    const b = right[key];
    let primary = 0;
    if (a === null || a === undefined) primary = b === null || b === undefined ? 0 : -1;
    else if (b === null || b === undefined) primary = 1;
    else if (key === 'orderNum') primary = Number(a) - Number(b);
    else primary = String(a).localeCompare(String(b), 'zh-CN');
    return (order === 'asc' ? primary : -primary) || compareId(left.menuId, right.menuId);
  }).map((node) => ({ ...node, children: sortMenuSiblings(node.children ?? [], field, order) }));
}

export function filterMenuTree(nodes: MenuInfo[], name: string, status: string): MenuInfo[] {
  const text = name.trim().toLocaleLowerCase();
  return nodes.flatMap((node) => {
    const children = filterMenuTree(node.children ?? [], text, status);
    const matches = (!text || node.menuName.toLocaleLowerCase().includes(text)) && (!status || node.status === status);
    return matches || children.length ? [{ ...node, children }] : [];
  });
}
