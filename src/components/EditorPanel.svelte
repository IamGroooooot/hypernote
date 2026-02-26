<script lang="ts">
  let pointerSelecting = false;

  type PresenceIndicator = {
    peerId: string;
    label: string;
    color: string;
    cursorProgress: number;
    scrollProgress: number;
    cursorLine: number;
  };

  export let title = 'Untitled';
  export let value = '';
  export let crdtSizeWarning = false;
  export let remotePresence: PresenceIndicator[] = [];
  export let showTitle = true;
  export let textareaEl: HTMLTextAreaElement | null = null;
  export let onInput: (nextValue: string) => void = () => {};
  export let onCursorChange: (nextOffset: number) => void = () => {};
  export let onScrollMetricsChange: (metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void = () => {};
  export let onTouchStart: (event: TouchEvent) => void = () => {};
  export let onTouchEnd: (event: TouchEvent) => void = () => {};

  function reportCursorPosition(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    onCursorChange(target.selectionStart ?? 0);
  }

  function reportScrollMetrics(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement;
    onScrollMetricsChange({
      scrollTop: target.scrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
    });
  }

  function handlePointerDown(): void {
    pointerSelecting = true;
  }

  function handlePointerMove(event: MouseEvent): void {
    if (!pointerSelecting || event.buttons !== 1) {
      return;
    }

    reportCursorPosition(event);
  }

  function handlePointerUp(event: Event): void {
    pointerSelecting = false;
    reportCursorPosition(event);
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<section class="editor-panel" on:touchstart={onTouchStart} on:touchend={onTouchEnd}>
  {#if crdtSizeWarning}
    <div class="crdt-warning">⚠ CRDT state exceeds 100 MB — editor performance may degrade</div>
  {/if}

  {#if showTitle}
    <h2>{title}</h2>
  {/if}

  <div class="editor-stage">
    <textarea
      bind:this={textareaEl}
      value={value}
      placeholder="Type fast. Persist in 500ms."
      on:input={(event) => {
        const target = event.currentTarget as HTMLTextAreaElement;
        onInput(target.value);
        onCursorChange(target.selectionStart ?? 0);
      }}
      on:click={reportCursorPosition}
      on:keyup={reportCursorPosition}
      on:select={reportCursorPosition}
      on:scroll={reportScrollMetrics}
      on:mousedown={handlePointerDown}
      on:mousemove={handlePointerMove}
      on:mouseup={handlePointerUp}
      on:mouseleave={handlePointerUp}
    ></textarea>

    {#if remotePresence.length > 0}
      <div class="presence-rail" aria-hidden="true">
        {#each remotePresence as presence (presence.peerId)}
          <span
            class="presence-tick cursor"
            style={`--presence-color:${presence.color}; --presence-y:${presence.cursorProgress * 100}%;`}
            title={`${presence.label} cursor line ${presence.cursorLine + 1}`}
          ></span>
          <span
            class="presence-tick scroll"
            style={`--presence-color:${presence.color}; --presence-y:${presence.scrollProgress * 100}%;`}
            title={`${presence.label} scroll`}
          ></span>
        {/each}
      </div>

      <div class="presence-chips" aria-hidden="true">
        {#each remotePresence as presence (presence.peerId)}
          <div class="presence-chip" style={`--presence-color:${presence.color};`}>
            <span class="dot"></span>
            <span class="name">{presence.label}</span>
            <span class="line">L{presence.cursorLine + 1}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .editor-stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .editor-stage textarea {
    height: 100%;
  }

  .crdt-warning {
    padding: 6px 16px;
    background: var(--danger-subtle);
    border-bottom: var(--danger-border);
    color: var(--danger);
    font-size: 11px;
    letter-spacing: 0.05em;
  }

  .presence-rail {
    position: absolute;
    top: 10px;
    right: 8px;
    bottom: 10px;
    width: 12px;
    pointer-events: none;
    opacity: 0.82;
  }

  .presence-tick {
    position: absolute;
    right: 0;
    top: var(--presence-y);
    transform: translateY(-50%);
    border-radius: var(--radius-round);
    background: var(--presence-color);
    box-shadow: 0 0 0 1px var(--bg-surface);
  }

  .presence-tick.cursor {
    width: 10px;
    height: 2px;
  }

  .presence-tick.scroll {
    width: 6px;
    height: 6px;
    opacity: 0.9;
  }

  .presence-chips {
    position: absolute;
    top: 8px;
    right: 26px;
    display: grid;
    gap: 4px;
    pointer-events: none;
    max-width: min(220px, 52%);
  }

  .presence-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: var(--border);
    border-radius: var(--radius-round);
    padding: 2px 7px;
    font-size: 10px;
    line-height: 1.2;
    color: var(--text-dim);
    background: color-mix(in srgb, var(--bg-surface) 88%, var(--presence-color) 12%);
    backdrop-filter: blur(4px);
  }

  .presence-chip .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-round);
    background: var(--presence-color);
    flex-shrink: 0;
  }

  .presence-chip .name {
    max-width: 108px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .presence-chip .line {
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
