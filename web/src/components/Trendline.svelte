<script lang="ts">
  /**
   * Trendline — pure SVG sparkline / bar chart component.
   *
   * mode="line":  Catmull-Rom smoothed curve
   * mode="bar":   vertical bars with rounded tops
   */

  interface Props {
    data: number[];
    mode?: 'line' | 'bar';
    color?: string;
    /** Domain floor — auto-computed from data when undefined */
    min?: number;
    /** Domain ceiling — auto-computed from data when undefined */
    max?: number;
  }

  let {
    data,
    mode = 'line',
    color = 'var(--accent)',
    min: propMin,
    max: propMax,
  }: Props = $props();

  // ── SVG coordinate space ──
  const PAD = 2;
  const W = 300;
  const H = 56;
  const drawW = W - PAD * 2;
  const drawH = H - PAD * 2;

  // ── Domain ──
  let domain = $derived.by(() => {
    if (data.length === 0) return { min: 0, max: 1 };
    const dMin = Math.min(...data);
    const dMax = Math.max(...data);
    const range = dMax - dMin || 1;
    return {
      min: propMin ?? (mode === 'bar' ? 0 : dMin - range * 0.05),
      max: propMax ?? (mode === 'bar' ? Math.max(dMax, 1) : dMax + range * 0.05),
    };
  });

  // ── Map value → SVG y ──
  function toY(v: number): number {
    const { min, max } = domain;
    const ratio = (v - min) / (max - min);
    return H - PAD - ratio * drawH;
  }

  // ── Line mode: Catmull-Rom → cubic bezier path ──
  let linePath = $derived.by(() => {
    if (data.length < 2) return '';
    const pts = data.map((v, i) => ({
      x: PAD + (i / (data.length - 1)) * drawW,
      y: toY(v),
    }));

    // Only 2 points → straight line
    if (pts.length === 2) {
      return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    }

    // Catmull-Rom to cubic bezier (tension = 0.5 → /6)
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  });

  // ── Bar mode: rect array ──
  let bars = $derived.by(() => {
    if (data.length === 0) return [];
    const step = drawW / data.length;
    const barW = Math.max(1, step * 0.65);
    const gap = step - barW;

    return data.map((v, i) => {
      const y = toY(v);
      const h = H - PAD - y;
      return {
        x: PAD + i * step + gap / 2,
        y,
        w: barW,
        h: Math.max(h, barW), // minimum visible height = bar width (capsule look)
        rx: barW / 2,
      };
    });
  });
</script>

{#if data.length > 0}
  <svg
    viewBox="0 0 {W} {H}"
    preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg"
    class="trendline"
    style="--line-color: {color}"
  >
    {#if mode === 'line' && linePath}
      <path d={linePath} fill="none" stroke="var(--line-color)" stroke-width="1.5" />
    {:else if mode === 'bar'}
      {#each bars as bar}
        <rect
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={bar.rx}
          fill="var(--line-color)"
          opacity="0.85"
        />
      {/each}
    {/if}
  </svg>
{:else}
  <div class="trendline-empty"></div>
{/if}

<style lang="scss">
  .trendline {
    display: block;
    width: 100%;
    height: auto;

    path {
      vector-effect: non-scaling-stroke;
    }
  }

  .trendline-empty {
    height: 56px;
    opacity: 0;
  }
</style>
