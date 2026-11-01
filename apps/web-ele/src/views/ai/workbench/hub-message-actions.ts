import type { IAgentScopeRuntimeWebUIInputData } from '@agentscope-ai/chat';

import type { RequestData } from './hub-message-draft';

import {
  useChatAnywhereInput,
  useChatAnywhereSessionsState,
} from '@agentscope-ai/chat';
import { Button, Flex, Input, message, Modal } from 'antd';
import { Copy, Pencil } from 'lucide-react';
import { createElement as h, useState } from 'react';

import { editedRequest } from './hub-message-draft';

/** Compose native Ant actions; historical business receipts are never rewritten or replayed. */
export function HubRequestActions({
  data,
  onSubmit,
}: {
  data: RequestData;
  onSubmit: (draft: IAgentScopeRuntimeWebUIInputData) => void;
}) {
  const { loading } = useChatAnywhereInput((v) => ({ loading: v.loading }));
  const { currentSessionId } = useChatAnywhereSessionsState();
  const [editing, setEditing] = useState<null | {
    query: string;
    session: string;
  }>(null);
  const draft = editedRequest(data);
  const submit = () => {
    if (
      !editing ||
      loading ||
      !editing.query.trim() ||
      editing.session !== currentSessionId
    )
      return;
    onSubmit(editedRequest(data, editing.query.trim()));
    setEditing(null);
  };
  return h(
    Flex,
    { justify: 'flex-end', gap: 4, className: 'hub-message-actions' },
    h(Button, {
      type: 'text',
      size: 'small',
      'aria-label': '复制消息',
      title: '复制',
      icon: h(Copy, { size: 15 }),
      disabled: !draft.query,
      onClick: () => {
        void navigator.clipboard
          .writeText(draft.query)
          .then(() => message.success('已复制'))
          .catch(() => message.error('复制失败，请重试'));
      },
    }),
    h(Button, {
      type: 'text',
      size: 'small',
      'aria-label': '修改消息',
      title: '修改',
      icon: h(Pencil, { size: 15 }),
      disabled: Boolean(loading),
      onClick: () =>
        setEditing({ query: draft.query, session: currentSessionId || '' }),
    }),
    h(
      Modal,
      {
        title: '修改后重新发送',
        open: Boolean(editing),
        okText: '发送修改',
        cancelText: '取消',
        onCancel: () => setEditing(null),
        onOk: submit,
        okButtonProps: {
          disabled:
            Boolean(loading) ||
            !editing?.query.trim() ||
            editing.session !== currentSessionId,
        },
      },
      h(Input.TextArea, {
        value: editing?.query || '',
        onChange: (event) =>
          setEditing((old) =>
            old ? { ...old, query: event.target.value } : old,
          ),
        'aria-label': '修改消息内容',
        autoSize: { minRows: 4, maxRows: 12 },
        maxLength: 32_768,
      }),
      draft.fileList?.length
        ? h(
            'p',
            { style: { marginTop: 12 } },
            `保留原消息的 ${draft.fileList.length} 张图片`,
          )
        : null,
    ),
  );
}
