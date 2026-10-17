import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrderedSceneAutosave, SaveProblem } from './ordered-autosave';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}
function setup() {
  vi.useFakeTimers();
  const writes: {
    command: {
      clientMutationId: string;
      expectedRevision: number;
      sceneKey: string;
      value: string;
    };
    response: ReturnType<typeof deferred<{ revision: number; value: string }>>;
  }[] = [];
  let nextId = 0;
  const store = new OrderedSceneAutosave<string>({
    clone: (value) => value,
    equal: (a, b) => a === b,
    mutationId: () => `mutation-${++nextId}`,
    persist: (command) => {
      const response = deferred<{ revision: number; value: string }>();
      writes.push({ command, response });
      return response.promise;
    },
    validate: (value): Record<string, string> =>
      value ? {} : { promptText: '请输入提示词' },
  });
  store.register('a', 1, 'original', true);
  store.register('b', 3, 'other', true);
  return { store, writes };
}
const tick = () => vi.advanceTimersByTimeAsync(600);
const settle = () => vi.advanceTimersByTimeAsync(0);
afterEach(() => vi.useRealTimers());

describe('ordered scene autosave', () => {
  it('debounces continuous input and marks saved only after the matching acknowledgement', async () => {
    const { store, writes } = setup();
    store.edit('a', 'first');
    await vi.advanceTimersByTimeAsync(599);
    store.edit('a', 'latest');
    await vi.advanceTimersByTimeAsync(599);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes[0]?.command.value).toBe('latest');
    expect(store.view('a').phase).toBe('saving');
    writes[0]?.response.resolve({ revision: 2, value: 'latest' });
    await settle();
    expect(store.view('a')).toMatchObject({
      dirty: false,
      phase: 'saved',
      revision: 2,
    });
  });
  it('serializes writes and rebases queued content on the acknowledged revision', async () => {
    const { store, writes } = setup();
    store.edit('a', 'first');
    await tick();
    store.edit('a', 'second');
    await tick();
    expect(writes).toHaveLength(1);
    writes[0]?.response.resolve({ revision: 2, value: 'first' });
    await settle();
    expect(writes[1]?.command).toMatchObject({
      expectedRevision: 2,
      value: 'second',
    });
    expect(store.view('a').value).toBe('second');
    writes[1]?.response.resolve({ revision: 3, value: 'second' });
    await settle();
    expect(store.view('a').phase).toBe('saved');
  });
  it('restarts debounce for fresh edits made after an older queued edit was due', async () => {
    const { store, writes } = setup();
    store.edit('a', 'first');
    await tick();
    store.edit('a', 'second');
    await tick();
    store.edit('a', 'third');
    writes[0]?.response.resolve({ revision: 2, value: 'first' });
    await settle();
    expect(writes).toHaveLength(1);
    await tick();
    expect(writes[1]?.command.value).toBe('third');
  });
  it('retains invalid newer input when an earlier valid save completes', async () => {
    const { store, writes } = setup();
    store.edit('a', 'first');
    await tick();
    store.edit('a', '');
    writes[0]?.response.resolve({ revision: 2, value: 'first' });
    await settle();
    expect(store.view('a')).toMatchObject({
      confirmed: 'first',
      phase: 'invalid',
      value: '',
    });
    expect(await store.flush('a')).toBe(false);
    expect(writes).toHaveLength(1);
  });
  it('retries an unknown network outcome with the same mutation before saving newer input', async () => {
    const { store, writes } = setup();
    store.edit('a', 'first');
    await tick();
    writes[0]?.response.reject(new Error('offline'));
    await settle();
    store.edit('a', 'second');
    await tick();
    expect(writes).toHaveLength(1);
    const completion = store.retry('a');
    await settle();
    expect(writes[1]?.command).toEqual(writes[0]?.command);
    writes[1]?.response.resolve({ revision: 2, value: 'first' });
    await settle();
    expect(writes[2]?.command).toMatchObject({
      expectedRevision: 2,
      value: 'second',
    });
    writes[2]?.response.resolve({ revision: 3, value: 'second' });
    await settle();
    expect(await completion).toBe(true);
  });
  it('requires explicit conflict resolution and a fresh mutation before overwrite', async () => {
    const { store, writes } = setup();
    store.edit('a', 'local');
    await tick();
    writes[0]?.response.reject(new SaveProblem('conflict', '版本冲突'));
    await settle();
    store.edit('a', 'newer local');
    await tick();
    expect(await store.retry('a')).toBe(false);
    store.resolveConflict('a', { revision: 4, value: 'server' }, 'keep-local');
    await tick();
    expect(writes).toHaveLength(1);
    const completion = store.retry('a');
    await settle();
    expect(writes[1]?.command).toMatchObject({
      expectedRevision: 4,
      value: 'newer local',
    });
    expect(writes[1]?.command.clientMutationId).not.toBe(
      writes[0]?.command.clientMutationId,
    );
    writes[1]?.response.resolve({ revision: 5, value: 'newer local' });
    await settle();
    expect(await completion).toBe(true);
  });
  it('flushes before switching and leaves failed input in the active scene', async () => {
    const { store, writes } = setup();
    await store.select('a');
    store.edit('a', 'local');
    const switching = store.select('b');
    await settle();
    expect(writes).toHaveLength(1);
    writes[0]?.response.reject(new Error('offline'));
    await settle();
    expect(await switching).toBe(false);
    expect(store.activeKey()).toBe('a');
    expect(store.view('a').value).toBe('local');
  });
  it('prevents stale selection and detail reloads from erasing edits', async () => {
    const { store, writes } = setup();
    await store.select('a');
    store.edit('a', 'local');
    const switching = store.select('b');
    const staying = store.select('a');
    store.register('a', 1, 'late detail', true);
    expect(store.view('a').value).toBe('local');
    await settle();
    writes[0]?.response.resolve({ revision: 2, value: 'local' });
    await settle();
    expect(await switching).toBe(false);
    expect(await staying).toBe(true);
    expect(store.activeKey()).toBe('a');
    store.register('a', 1, 'older detail', true);
    expect(store.view('a').revision).toBe(2);
  });
  it('settles permission loss without hanging or starting queued writes', async () => {
    const { store, writes } = setup();
    store.edit('a', 'local');
    const flushing = store.flush('a');
    await settle();
    store.edit('a', 'newer');
    store.setEditable('a', false);
    expect(await flushing).toBe(false);
    expect(await store.flush('a')).toBe(false);
    writes[0]?.response.resolve({ revision: 2, value: 'local' });
    await tick();
    expect(writes).toHaveLength(1);
    expect(store.view('a')).toMatchObject({
      phase: 'readonly',
      value: 'newer',
    });
  });
  it('ignores late responses after disposal and settles pending switches', async () => {
    const { store, writes } = setup();
    await store.select('a');
    store.edit('a', 'local');
    const switching = store.select('b');
    await settle();
    store.dispose();
    writes[0]?.response.resolve({ revision: 2, value: 'local' });
    await tick();
    expect(await switching).toBe(false);
    expect(writes).toHaveLength(1);
  });
});
