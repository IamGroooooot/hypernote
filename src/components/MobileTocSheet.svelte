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
  <div class="mobile-toc-backdrop" on:click={handleBackdropClick}>
    <div class="mobile-toc-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-toc-title">
      <header>
        <h2 id="mobile-toc-title">Table of contents</h2>
        <button type="button" on:click={onClose}>close</button>
      </header>

      {#if headings.length === 0}
        <p class="empty">No headings yet. Start with # heading.</p>
      {:else}
        <ul>
          {#each headings as heading}
            <li>
              <button
                type="button"
                class="toc-link"
                class:active={activeHeadingId === heading.id}
                style={`--toc-indent:${Math.max(0, heading.level - 1)}; --toc-depth:${Math.max(0, heading.level - 1)};`}
                on:click={() => onSelectHeading(heading.offset)}
              >
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
  .mobile-toc-backdrop {
    position: fixed;
    inset: 0;
    background: var(--overlay-medium);
    z-index: 145;
    display: flex;
    justify-content: flex-start;
  }

  .mobile-toc-sheet {
    width: min(280px, 78vw);
    height: 100%;
    border-right: var(--border);
    background: var(--surface-frosted);
    backdrop-filter: blur(10px);
    box-shadow: var(--shadow-elevated);
    display: grid;
    grid-template-rows: auto 1fr;
    padding-top: env(safe-area-inset-top);
  }

  header {
    border-bottom: var(--border);
    padding: 8px 10px;
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

  .empty {
    margin: 0;
    padding: 12px;
    color: var(--text-dim);
    font-size: 12px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 8px 10px;
    overflow: auto;
    display: grid;
    gap: 1px;
  }

  .toc-link {
    width: 100%;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    text-align: left;
    display: block;
    padding: 5px 2px;
    padding-left: calc(4px + var(--toc-indent, 0) * 12px);
    line-height: 1.3;
    opacity: calc(0.92 - var(--toc-depth, 0) * 0.08);
  }

  .toc-link:hover,
  .toc-link.active {
    color: var(--accent);
    background: var(--accent-subtle);
    opacity: 1;
  }

  .text {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (min-width: 801px) {
    .mobile-toc-backdrop {
      display: none;
    }
  }
</style>
