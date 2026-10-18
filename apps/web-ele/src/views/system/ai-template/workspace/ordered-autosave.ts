/** Frontend coordination; persistence is supplied by the scene HTTP adapter. */
export type SavePhase =
  | 'conflict'
  | 'error'
  | 'idle'
  | 'invalid'
  | 'readonly'
  | 'saved'
  | 'saving'
  | 'waiting';
export interface SaveCommand<T> {
  clientMutationId: string;
  expectedRevision: number;
  sceneKey: string;
  value: T;
}
export interface SaveAcknowledgement<T> {
  revision: number;
  value: T;
}
export class SaveProblem extends Error {
  constructor(
    public kind: 'conflict' | 'denied' | 'unavailable' | 'validation',
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export interface SaveView<T> {
  confirmed: T;
  dirty: boolean;
  editable: boolean;
  error: null | string;
  fields: Record<string, string>;
  phase: SavePhase;
  revision: number;
  sceneKey: string;
  value: T;
}
interface Pending<T> {
  command: SaveCommand<T>;
  generation: number;
}
interface Entry<T> {
  confirmed: T;
  due: boolean;
  editable: boolean;
  error: null | string;
  failed: null | Pending<T>;
  fields: Record<string, string>;
  flushing: boolean;
  generation: number;
  pending: null | Pending<T>;
  phase: SavePhase;
  revision: number;
  timer: null | ReturnType<typeof setTimeout>;
  value: T;
  waiters: ((success: boolean) => void)[];
}
interface Options<T> {
  clone: (value: T) => T;
  delay?: number;
  equal: (left: T, right: T) => boolean;
  mutationId: () => string;
  persist: (command: SaveCommand<T>) => Promise<SaveAcknowledgement<T>>;
  reconcile?: (local: T, confirmed: T) => T;
  validate?: (value: T) => Record<string, string>;
}

/** One in-flight write per scene. No localStorage, implicit overwrite, model call, or production fallback. */
export class OrderedSceneAutosave<T> {
  private disposed = false;
  private entries = new Map<string, Entry<T>>();
  private listeners = new Set<(sceneKey: string) => void>();
  private selected: null | string = null;
  private selection = 0;
  constructor(private options: Options<T>) {}

  activeKey() {
    return this.selected;
  }
  dispose() {
    this.disposed = true;
    this.selection++;
    for (const e of this.entries.values()) {
      this.clearTimer(e);
      this.settle(e, false);
    }
    this.listeners.clear();
    this.entries.clear();
  }
  edit(sceneKey: string, value: T) {
    if (this.disposed) return;
    const e = this.entry(sceneKey);
    if (!e.editable) return;
    e.value = this.options.clone(value);
    e.generation++;
    this.clearTimer(e);
    e.due = false;
    if (e.phase === 'conflict' || e.phase === 'error') {
      this.notify(sceneKey);
      return;
    }
    e.error = null;
    e.fields = this.validate(e.value);
    if (Object.keys(e.fields).length > 0) {
      e.phase = 'invalid';
      this.notify(sceneKey);
      this.settle(e, false);
      return;
    }
    if (!this.dirty(e) && !e.pending) {
      e.phase = 'idle';
      this.notify(sceneKey);
      this.settle(e, true);
      return;
    }
    e.phase = e.pending ? 'saving' : 'waiting';
    e.timer = setTimeout(() => {
      e.timer = null;
      e.due = true;
      this.start(sceneKey);
    }, this.options.delay ?? 600);
    this.notify(sceneKey);
  }
  flush(sceneKey: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const e = this.entry(sceneKey);
    if (!e.editable) return Promise.resolve(!e.pending && !this.dirty(e));
    if (e.phase === 'conflict' || e.phase === 'error')
      return Promise.resolve(false);
    if (!e.pending && !this.dirty(e)) return Promise.resolve(true);
    e.fields = this.validate(e.value);
    if (Object.keys(e.fields).length > 0) {
      e.phase = 'invalid';
      this.notify(sceneKey);
      return Promise.resolve(false);
    }
    e.flushing = true;
    e.due = true;
    this.clearTimer(e);
    const completion = new Promise<boolean>((resolve) =>
      e.waiters.push(resolve),
    );
    this.start(sceneKey);
    return completion;
  }
  async flushAll(): Promise<boolean> {
    if (this.disposed) return false;
    for (const key of this.entries.keys())
      if (!(await this.flush(key))) return false;
    return !this.hasUnconfirmedChanges();
  }
  hasUnconfirmedChanges() {
    return [...this.entries.values()].some(
      (entry) =>
        this.dirty(entry) ||
        Boolean(entry.pending) ||
        Boolean(entry.failed) ||
        entry.phase === 'conflict' ||
        entry.phase === 'error',
    );
  }
  register(sceneKey: string, revision: number, value: T, editable: boolean) {
    if (this.disposed) return;
    if (!sceneKey || !Number.isSafeInteger(revision) || revision < 0)
      throw new Error('Invalid scene state');
    // A late detail reload must not erase locally edited or unresolved content.
    const existing = this.entries.get(sceneKey);
    if (existing && revision < existing.revision) return;
    if (
      existing &&
      (existing.pending ||
        this.dirty(existing) ||
        existing.phase === 'conflict' ||
        existing.phase === 'error')
    )
      return;
    if (existing) this.clearTimer(existing);
    this.entries.set(sceneKey, {
      confirmed: this.options.clone(value),
      value: this.options.clone(value),
      revision,
      editable,
      generation: 0,
      phase: editable ? 'idle' : 'readonly',
      pending: null,
      failed: null,
      timer: null,
      due: false,
      flushing: false,
      error: null,
      fields: {},
      waiters: [],
    });
    this.notify(sceneKey);
  }
  resolveConflict(
    sceneKey: string,
    server: SaveAcknowledgement<T>,
    choice: 'keep-local' | 'use-server',
  ) {
    if (this.disposed) return;
    const e = this.entry(sceneKey);
    if (
      e.pending ||
      e.phase !== 'conflict' ||
      !Number.isSafeInteger(server.revision) ||
      server.revision < e.revision
    )
      throw new Error('Conflict resolution unavailable');
    this.clearTimer(e);
    e.confirmed = this.options.clone(server.value);
    e.revision = server.revision;
    if (choice === 'use-server') e.value = this.options.clone(server.value);
    e.failed = null;
    e.error = null;
    e.fields = {};
    e.generation++;
    // Keeping local content is not permission to overwrite automatically. The user must explicitly retry.
    if (e.editable) e.phase = this.dirty(e) ? 'waiting' : 'idle';
    else e.phase = 'readonly';
    this.notify(sceneKey);
  }
  retry(sceneKey: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const e = this.entry(sceneKey);
    if (!e.editable || e.phase === 'conflict') return Promise.resolve(false);
    if (e.pending) return this.flush(sceneKey);
    e.error = null;
    e.fields = {};
    if (e.failed) {
      // Unknown network outcome: retry precisely the original mutation, then save any newer edits.
      const pending = e.failed;
      e.failed = null;
      e.flushing = true;
      const completion = new Promise<boolean>((resolve) =>
        e.waiters.push(resolve),
      );
      this.dispatch(sceneKey, pending);
      return completion;
    }
    e.phase = 'waiting';
    return this.flush(sceneKey);
  }
  async select(sceneKey: string): Promise<boolean> {
    if (this.disposed) return false;
    this.entry(sceneKey);
    const generation = ++this.selection;
    if (
      this.selected &&
      this.selected !== sceneKey &&
      !(await this.flush(this.selected))
    )
      return false;
    if (this.disposed || generation !== this.selection) return false;
    this.selected = sceneKey;
    this.notify(sceneKey);
    return true;
  }
  setEditable(sceneKey: string, editable: boolean) {
    if (this.disposed) return;
    const e = this.entry(sceneKey);
    e.editable = editable;
    if (!editable) {
      this.clearTimer(e);
      e.phase = 'readonly';
      this.settle(e, false);
    } else if (e.phase === 'readonly') {
      if (e.failed) e.phase = 'error';
      else e.phase = this.dirty(e) ? 'waiting' : 'idle';
    }
    this.notify(sceneKey);
  }
  subscribe(listener: (sceneKey: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  view(sceneKey: string): SaveView<T> {
    const e = this.entry(sceneKey);
    return {
      sceneKey,
      value: this.options.clone(e.value),
      confirmed: this.options.clone(e.confirmed),
      revision: e.revision,
      editable: e.editable,
      dirty: this.dirty(e),
      phase: e.phase,
      error: e.error,
      fields: { ...e.fields },
    };
  }
  private accept(
    sceneKey: string,
    pending: Pending<T>,
    ack: SaveAcknowledgement<T>,
  ) {
    if (this.disposed) return;
    const e = this.entry(sceneKey);
    if (e.pending !== pending) return;
    if (
      !Number.isSafeInteger(ack.revision) ||
      ack.revision <= pending.command.expectedRevision
    ) {
      this.reject(
        sceneKey,
        pending,
        new SaveProblem('unavailable', '保存响应无效，请重试'),
      );
      return;
    }
    e.pending = null;
    e.failed = null;
    e.revision = ack.revision;
    e.confirmed = this.options.clone(ack.value);
    e.error = null;
    if (e.generation === pending.generation)
      e.value = this.options.clone(ack.value);
    else if (this.options.reconcile)
      e.value = this.options.reconcile(e.value, this.options.clone(ack.value));
    if (!e.editable) {
      e.phase = 'readonly';
      this.notify(sceneKey);
      this.settle(e, false);
      return;
    }
    e.fields = this.validate(e.value);
    if (Object.keys(e.fields).length > 0) {
      e.phase = 'invalid';
      this.notify(sceneKey);
      this.settle(e, false);
      return;
    }
    if (!this.dirty(e)) {
      this.clearTimer(e);
      e.phase = 'saved';
      this.notify(sceneKey);
      this.settle(e, true);
      return;
    }
    e.phase = 'waiting';
    this.notify(sceneKey);
    if (e.flushing || e.due) {
      this.clearTimer(e);
      this.start(sceneKey);
    }
  }
  private clearTimer(e: Entry<T>) {
    if (e.timer !== null) clearTimeout(e.timer);
    e.timer = null;
  }
  private dirty(e: Entry<T>) {
    return !this.options.equal(e.value, e.confirmed);
  }
  private dispatch(sceneKey: string, pending: Pending<T>) {
    const e = this.entry(sceneKey);
    e.pending = pending;
    e.phase = 'saving';
    this.notify(sceneKey);
    // Promise.resolve also converts a synchronous adapter failure into the same controlled path.
    void Promise.resolve()
      .then(() =>
        this.options.persist({
          ...pending.command,
          value: this.options.clone(pending.command.value),
        }),
      )
      .then(
        (ack) => this.accept(sceneKey, pending, ack),
        (error) => this.reject(sceneKey, pending, error),
      );
  }
  private entry(sceneKey: string) {
    const e = this.entries.get(sceneKey);
    if (!e) throw new Error('Unknown scene');
    return e;
  }
  private notify(sceneKey: string) {
    if (!this.disposed)
      for (const listener of this.listeners) listener(sceneKey);
  }
  private reject(sceneKey: string, pending: Pending<T>, error: unknown) {
    if (this.disposed) return;
    const e = this.entry(sceneKey);
    if (e.pending !== pending) return;
    e.pending = null;
    this.clearTimer(e);
    const problem =
      error instanceof SaveProblem
        ? error
        : new SaveProblem('unavailable', '保存失败，请重试');
    e.error = problem.message;
    e.fields = { ...problem.fields };
    e.failed = problem.kind === 'unavailable' ? pending : null;
    if (problem.kind === 'denied') {
      e.editable = false;
      e.phase = 'readonly';
    } else if (problem.kind === 'conflict') e.phase = 'conflict';
    else e.phase = problem.kind === 'validation' ? 'invalid' : 'error';
    this.notify(sceneKey);
    this.settle(e, false);
  }
  private settle(e: Entry<T>, success: boolean) {
    e.flushing = false;
    e.waiters.splice(0).forEach((resolve) => resolve(success));
  }
  private start(sceneKey: string) {
    if (this.disposed) return;
    const e = this.entry(sceneKey);
    if (
      e.pending ||
      !e.editable ||
      e.phase === 'conflict' ||
      e.phase === 'error'
    )
      return;
    e.fields = this.validate(e.value);
    if (Object.keys(e.fields).length > 0) {
      e.phase = 'invalid';
      this.notify(sceneKey);
      this.settle(e, false);
      return;
    }
    if (!this.dirty(e)) {
      e.phase = 'idle';
      this.notify(sceneKey);
      this.settle(e, true);
      return;
    }
    e.due = false;
    this.dispatch(sceneKey, {
      generation: e.generation,
      command: {
        sceneKey,
        expectedRevision: e.revision,
        clientMutationId: this.options.mutationId(),
        value: this.options.clone(e.value),
      },
    });
  }
  private validate(value: T) {
    return this.options.validate?.(this.options.clone(value)) ?? {};
  }
}
