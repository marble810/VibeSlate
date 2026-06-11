<script lang="ts">
  interface Props {
    size?: string;
  }

  let { size = '10px' }: Props = $props();
</script>

<svg
  class="eink-check-icon"
  style="--eink-icon-size: {size};"
  viewBox="0 0 10 10"
  aria-hidden="true"
>
  <polyline
    points="1.5,5 4,7.5 8.5,2.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style lang="scss">
  .eink-check-icon {
    display: block;
    width: var(--eink-icon-size);
    height: var(--eink-icon-size);
    color: currentColor;
    flex-shrink: 0;
  }
</style>
