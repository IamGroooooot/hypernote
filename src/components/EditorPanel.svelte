<script lang="ts">
  export let title = 'Untitled';
  export let value = '';
  export let onInput: (nextValue: string) => void = () => {};
</script>

<section class="editor-panel">
  <h2>{title}</h2>
  <textarea
    value={value}
    placeholder="Type fast. Persist in 500ms."
    on:input={(event) => {
      onInput((event.currentTarget as HTMLTextAreaElement).value);
    }}
  ></textarea>
</section>
