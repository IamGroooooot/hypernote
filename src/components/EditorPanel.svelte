<script lang="ts">
  export let title = 'Untitled';
  export let value = '';
  export let crdtSizeWarning = false;
  export let onInput: (nextValue: string) => void = () => {};
</script>

<section class="editor-panel">
  {#if crdtSizeWarning}
    <div class="crdt-warning">
      ⚠ CRDT state exceeds 100 MB — editor performance may degrade
    </div>
  {/if}
  <h2>{title}</h2>
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
    background: rgba(255, 69, 96, 0.12);
    border-bottom: 1px solid rgba(255, 69, 96, 0.4);
    color: var(--danger);
    font-size: 11px;
    letter-spacing: 0.05em;
  }
</style>
