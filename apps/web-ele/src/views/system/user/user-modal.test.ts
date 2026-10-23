import { mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRoleList } from '#/api/system/role';
import { getUser, updateUser } from '#/api/system/user';

import UserModal from './user-modal.vue';

const state = vi.hoisted(() => ({
  codes: ['system:user:query', 'system:user:edit'],
  mode: 'edit',
  values: {} as Record<string, unknown>,
  options: undefined as
    | undefined
    | {
        onConfirm: () => Promise<void>;
        onOpenChange: (open: boolean) => Promise<void>;
      },
  schema: vi.fn(),
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: state.codes }),
}));
vi.mock('@vben/common-ui', () => ({
  useVbenModal: (options: typeof state.options) => {
    state.options = options;
    return [
      { template: '<div><slot /></div>' },
      {
        getData: () => ({ mode: state.mode, id: '9007199254740993' }),
        setState: vi.fn(),
        lock: vi.fn(),
        unlock: vi.fn(),
        close: vi.fn(),
      },
    ];
  },
}));
vi.mock('#/adapter/form', () => {
  const rule = {
    regex: () => rule,
    max: () => rule,
    email: () => rule,
    refine: () => rule,
  };
  return {
    z: { string: () => rule, union: () => rule, literal: () => rule },
    useVbenForm: () => [
      { template: '<div />' },
      {
        resetForm: async () => {
          state.values = {};
        },
        setValues: async (values: Record<string, unknown>) => {
          state.values = { ...values };
        },
        getValues: async () => state.values,
        validate: async () => ({ valid: true }),
        setState: vi.fn(),
        updateSchema: state.schema,
        form: { setFieldError: vi.fn() },
      },
    ],
  };
});
vi.mock('#/api/system/user', () => ({
  getUser: vi.fn(),
  addUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('#/api/system/role', () => ({ getRoleList: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  state.codes = ['system:user:query', 'system:user:edit'];
  state.mode = 'edit';
  state.values = {};
  vi.mocked(getUser).mockResolvedValue({
    user: {
      userId: '9007199254740993',
      username: 'operator',
      nickname: '原昵称',
      mobile: '13900001111',
      email: '',
      avatar: '',
      status: 1,
      createTime: '',
    },
    roleIds: ['9007199254740995'],
  });
});
function modal() {
  if (!state.options) throw new Error('原生用户Modal未初始化');
  return state.options;
}
describe('用户与角色查询的独立授权', () => {
  it('opens details without querying roles when role:list is absent', async () => {
    state.mode = 'view';
    mount(UserModal);
    await modal().onOpenChange(true);
    expect(getRoleList).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith('9007199254740993');
    expect(state.values.roleIds).toEqual(['9007199254740995']);
  });
  it('edits ordinary fields and preserves the original roles without role:list', async () => {
    mount(UserModal);
    await modal().onOpenChange(true);
    state.values.nickname = '新昵称';
    // 模拟禁用/隐藏字段未出现在原生表单值中。
    delete state.values.roleIds;
    await modal().onConfirm();
    expect(getRoleList).not.toHaveBeenCalled();
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '9007199254740993',
        nickname: '新昵称',
        roleIds: ['9007199254740995'],
      }),
    );
  });
  it('keeps user editing available if the optional authorized role request fails', async () => {
    state.codes.push('system:role:list');
    vi.mocked(getRoleList).mockRejectedValueOnce(new Error('offline'));
    mount(UserModal);
    await modal().onOpenChange(true);
    state.values.nickname = '继续编辑';
    state.values.roleIds = [];
    await modal().onConfirm();
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: '继续编辑',
        roleIds: ['9007199254740995'],
      }),
    );
  });
});
