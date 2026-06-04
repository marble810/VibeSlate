<script lang="ts">
  let now = $state(new Date());

  $effect(() => {
    const id = setInterval(() => {
      now = new Date();
    }, 1000);
    return () => clearInterval(id);
  });
</script>

<header>
  <h1>Marble Panel</h1>
  <time datetime={now.toISOString()}>
    {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
  </time>
</header>

<style lang="scss">
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text);
  }

  time {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--text-muted);
  }
</style>
