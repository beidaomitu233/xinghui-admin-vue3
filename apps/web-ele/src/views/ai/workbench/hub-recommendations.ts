/** Suggestions use business capabilities already available to the signed-in account. */
export function recommendations(permissions: string[]) {
  const allowed = new Set(permissions);
  return [
    {
      permission: 'lowcode:record:list',
      label: '整理业务数据',
      value: '看看我能访问哪些业务表单，列出可以查询和管理的数据。',
    },
    {
      permission: 'system:user:list',
      label: '查看用户情况',
      value: '查一下当前用户的启用情况，列出需要关注的账号。',
    },
    {
      permission: 'monitor:operlog:list',
      label: '排查最近失败操作',
      value: '查看最近失败的业务操作，按时间列出问题和结果。',
    },
    {
      permission: 'monitor:job:list',
      label: '检查定时任务',
      value: '检查当前定时任务的启用状态，列出暂停的任务。',
    },
    {
      permission: 'system:businessConfig:query',
      label: '检查业务接入配置',
      value:
        '检查微信、短信、邮件和存储的配置状态，告诉我哪些还没配置好，不要显示密钥。',
    },
    {
      permission: 'system:dict:list',
      label: '梳理数据字典',
      value: '列出当前的数据字典，看看有哪些停用的类型和条目。',
    },
  ]
    .filter((item) => allowed.has(item.permission))
    .map(({ label, value }) => ({ label, value }));
}
