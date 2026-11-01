import type { HubAdapter } from './hub-adapter';

import {
  HistoryPanel,
  useChatAnywhereSessions,
  useChatAnywhereSessionsState,
} from '@agentscope-ai/chat';
import { Empty, Flex, Input, message } from 'antd';
import { Pencil, Search, Trash2 } from 'lucide-react';
import { createElement as h, useState } from 'react';

/** Extend the native HistoryPanel; selection, inline editing and grouping stay with AgentScope. */
export function HubSessions({ adapter }: { adapter: HubAdapter }) {
  const { sessions, currentSessionId } = useChatAnywhereSessionsState();
  const controls = useChatAnywhereSessions();
  const [search, setSearch] = useState('');
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const items = sessions
    .filter((session) =>
      session.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    )
    .map((session) => {
      const timestamp = Date.parse(adapter.sessionUpdatedAt(session.id) || '');
      const date = new Date(timestamp);
      date.setHours(0, 0, 0, 0);
      const age = Math.round((start.getTime() - date.getTime()) / 86_400_000);
      let group = '更早';
      if (Number.isFinite(timestamp)) {
        if (age <= 0) group = '今天';
        else if (age === 1) group = '昨天';
        else if (age < 7) group = '最近7天';
      }
      return {
        key: session.id,
        label: session.name || '新对话',
        timestamp,
        group,
      };
    });
  return h(
    Flex,
    { vertical: true, gap: 12, style: { minHeight: 0, height: '100%' } },
    h(Input, {
      placeholder: '搜索对话',
      'aria-label': '搜索对话',
      allowClear: true,
      prefix: h(Search, { size: 15, style: { opacity: 0.5 } }),
      variant: 'filled',
      style: { borderRadius: 8 },
      value: search,
      onChange: (event) => setSearch(event.target.value),
    }),
    items.length === 0
      ? h(Empty, {
          image: Empty.PRESENTED_IMAGE_SIMPLE,
          description: search ? '没有匹配的对话' : '暂无对话',
        })
      : h(HistoryPanel, {
          style: { overflowY: 'auto', minHeight: 0 },
          items,
          activeKey: currentSessionId,
          onActiveChange: controls.changeCurrentSessionId,
          groupable: {
            sort: (a, b) =>
              ['今天', '昨天', '最近7天', '更早'].indexOf(a) -
              ['今天', '昨天', '最近7天', '更早'].indexOf(b),
          },
          menu: [
            {
              key: 'edit',
              label: '重命名',
              icon: h(Pencil, { size: 15 }),
              onEdit: async (label, session) => {
                const title = label.trim();
                if (!title || title.length > 160) {
                  message.error('对话名称需为1至160个字符');
                  throw new Error('Invalid conversation title');
                }
                await controls.updateSession({ id: session.key, name: title });
              },
            },
            {
              key: 'delete',
              label: '归档',
              icon: h(Trash2, { size: 15 }),
              onClick: (session) => {
                void controls
                  .removeSession({ id: session.key })
                  .catch(() =>
                    message.error('归档未完成，请先停止正在执行的任务后重试'),
                  );
              },
            },
          ],
        }),
  );
}
