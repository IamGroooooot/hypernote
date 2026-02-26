<script lang="ts">
  export let title = 'Untitled';
  export let value = '';
  export let crdtSizeWarning = false;
  export let showTitle = true;
  export let onInput: (nextValue: string) => void = () => {};
  export let onTouchStart: (event: TouchEvent) => void = () => {};
  export let onTouchEnd: (event: TouchEvent) => void = () => {};
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<section class="editor-panel" on:touchstart={onTouchStart} on:touchend={onTouchEnd}>
  {#if crdtSizeWarning}
    <div class="crdt-warning">⚠ CRDT state exceeds 100 MB — editor performance may degrade</div>
  {/if}

  {#if showTitle}
    <h2>{title}</h2>
  {/if}

  <textarea
    value={value}
    placeholder="Type fast. Persist in 500ms."
    on:input={(event) => {
      onInput((event.currentTarget as HTMLTextAreaElement).value);
    }}
  ></textarea>
</section>

<style>
  .crdt-warning {
    padding: 6px 16px;
    background: var(--danger-subtle);
    border-bottom: var(--danger-border);
    color: var(--danger);
    font-size: 11px;
    letter-spacing: 0.05em;
  }
</style>
