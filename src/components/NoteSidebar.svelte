<script lang="ts">
  import type { NoteMeta } from '../lib/contracts';

  export let notes: NoteMeta[] = [];
  export let selectedId = '';
  export let onSelect: (noteId: string) => void = () => {};
</script>

<aside class="note-list">
  <h2>NOTES</h2>
  {#if notes.length === 0}
    <p class="empty-state">No notes</p>
  {:else}
    {#each notes as note}
      <button
        class:selected={note.id === selectedId}
        on:click={() => {
          onSelect(note.id);
        }}
      >
        {note.title}
      </button>
    {/each}
  {/if}
</aside>
