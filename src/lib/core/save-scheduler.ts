export type SaveTask = () => void | Promise<void>;

export interface DebouncedSaveScheduler {
  schedule(key: string, task: SaveTask): void;
  cancel(key: string): void;
}

export function createDebouncedSaveScheduler(delayMs = 500): DebouncedSaveScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key: string, task: SaveTask): void {
      const activeTimer = timers.get(key);
      if (activeTimer) {
        clearTimeout(activeTimer);
      }

      const nextTimer = setTimeout(() => {
        timers.delete(key);
        void task();
      }, delayMs);

      timers.set(key, nextTimer);
    },
    cancel(key: string): void {
      const activeTimer = timers.get(key);
      if (!activeTimer) {
        return;
      }

      clearTimeout(activeTimer);
      timers.delete(key);
    },
  };
}
