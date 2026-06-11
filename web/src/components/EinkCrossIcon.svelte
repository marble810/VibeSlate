<script lang="ts">
  interface Props {
    size?: string;
  }

  let { size = '10px' }: Props = $props();
</script>

<svg
  class="eink-cross-icon"
  style="--eink-icon-size: {size};"
  viewBox="0 0 10 10"
  aria-hidden="true"
>
  <line
    x1="2"
    y1="2"
    x2="8"
    y2="8"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
  />
  <line
    x1="8"
    y1="2"
    x2="2"
    y2="8"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
  />
</svg>

<style lang="scss">
  .eink-cross-icon {
    display: block;
    width: var(--eink-icon-size);
    height: var(--eink-icon-size);
    color: currentColor;
    flex-shrink: 0;
  }
</style>
