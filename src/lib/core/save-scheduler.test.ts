import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDebouncedSaveScheduler } from './save-scheduler';

describe('createDebouncedSaveScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs save task after 500ms debounce window', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const scheduler = createDebouncedSaveScheduler(500);

    scheduler.schedule('note-1', () => {
      calls.push('note-1');
    });

    vi.advanceTimersByTime(499);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['note-1']);
  });

  it('reschedules the same key inside debounce window', () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const scheduler = createDebouncedSaveScheduler(500);

    scheduler.schedule('note-1', () => {
      calls.push('first');
    });

    vi.advanceTimersByTime(300);

    scheduler.schedule('note-1', () => {
      calls.push('second');
    });

    vi.advanceTimersByTime(499);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['second']);
  });
});
