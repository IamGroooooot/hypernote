<script lang="ts">
  import type { TocHeading } from '../lib/editor/markdown-toc';

  export let open = false;
  export let headings: TocHeading[] = [];
  export let activeHeadingId = '';
  export let onClose: () => void = () => {};
  export let onSelectHeading: (offset: number) => void = () => {};

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="toc-backdrop" on:click={handleBackdropClick}>
    <div class="toc-panel" role="dialog" aria-modal="true" aria-labelledby="toc-panel-title">
      <header>
        <h2 id="toc-panel-title">Table of contents</h2>
        <button type="button" on:click={onClose}>close</button>
      </header>

      {#if headings.length === 0}
        <p class="empty">No markdown headings yet. Add lines like # Heading.</p>
      {:else}
        <ul>
          {#each headings as heading}
            <li>
              <button
                type="button"
                class="toc-link"
                class:active={activeHeadingId === heading.id}
                style={`--toc-indent:${Math.max(0, heading.level - 1)};`}
                on:click={() => onSelectHeading(heading.offset)}
              >
                <span class="line">L{heading.line}</span>
                <span class="text">{heading.text}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .toc-backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
    background: transparent;
  }

  .toc-panel {
    position: absolute;
    top: 56px;
    right: max(10px, env(safe-area-inset-right));
    width: min(320px, calc(100vw - 20px));
    max-height: calc(100vh - 72px);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-elevated);
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  header {
    border-bottom: var(--border);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
  }

  header button {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 4px 8px;
  }

  header button:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }

  .empty {
    margin: 0;
    padding: 12px;
    color: var(--text-dim);
    font-size: 12px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 8px;
    overflow: auto;
    display: grid;
    gap: 4px;
  }

  .toc-link {
    width: 100%;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 8px;
    padding-left: calc(10px + var(--toc-indent, 0) * 12px);
  }

  .toc-link:hover,
  .toc-link.active {
    border-color: var(--accent-muted);
    color: var(--accent);
    background: var(--accent-subtle);
  }

  .line {
    font-size: 10px;
    color: var(--text-dim);
    min-width: 28px;
  }

  .text {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 800px) {
    .toc-backdrop {
      display: none;
    }
  }
</style>
