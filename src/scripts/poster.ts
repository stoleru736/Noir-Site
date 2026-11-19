// Poster landing: ONE rAF-throttled scroll handler writes --p on pinned stages; one IntersectionObserver reveals atoms;
// two small canvas painters (hero scan lines, product plates) only run while visible. No animation library.

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// ---- Scroll stages -------------------------------------------------------------------------------------------------
function initStages(): void {
  const stages = Array.from(document.querySelectorAll<HTMLElement>('[data-stage]'));
  const ladder = document.querySelector<HTMLElement>('[data-ladder]');
  const rows = ladder ? Array.from(ladder.querySelectorAll<HTMLElement>('[data-row]')) : [];
  const numEls = Array.from(document.querySelectorAll<HTMLElement>('[data-num]'));
  const tagEls = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
  let current = -1;
  let queued = false;

  const setIndex = (i: number): void => {
    if (i === current) return;
    current = i;
    rows.forEach((row, k) => row.classList.toggle('on', k <= i));
    const row = rows[i];
    const num = row?.dataset['n'] ?? '001';
    numEls.forEach((el) => {
      const lead = el.querySelector('[data-lead]');
      const tail = el.querySelector('[data-tail]');
      if (lead) lead.textContent = num.slice(0, 1);
      if (tail) tail.textContent = num.slice(1);
    });
    tagEls.forEach((el) => (el.textContent = `PAS ${i + 1}/${rows.length}`));
  };

  const update = (): void => {
    queued = false;
    const vh = innerHeight;
    for (const s of stages) {
      const r = s.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const pin = s.firstElementChild as HTMLElement | null;
      const span = r.height - (pin ? pin.clientHeight : vh);
      const p = span > 0 ? clamp01(-r.top / span) : 0;
      s.style.setProperty('--p', p.toFixed(4));
      if (s === ladder) setIndex(Math.min(rows.length - 1, Math.floor(p * rows.length)));
    }
  };
  const request = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request, { passive: true });
  setIndex(0);
  update();
}

// ---- Reveals -------------------------------------------------------------------------------------------------------
function initReveal(): void {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-rev],[data-words]'));
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
  );
  // Hero atoms sit at the very bottom of the first screen, inside the observer's bottom margin: reveal them on load.
  targets.forEach((t) => {
    if (t.closest('.hero')) requestAnimationFrame(() => t.classList.add('in'));
    else io.observe(t);
  });
}

// ---- Hero plate: scan lines with a drifting orange bloom ----------------------------------------------------------
function initScan(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let running = false;

  const size = (): void => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    const r = canvas.getBoundingClientRect();
    W = canvas.width = Math.max(1, Math.round(r.width * dpr));
    H = canvas.height = Math.max(1, Math.round(r.height * dpr));
  };
  const draw = (t: number): void => {
    ctx.clearRect(0, 0, W, H);
    const bx = (((t * 0.000045) % 1.5) - 0.25) * W;
    const g = ctx.createLinearGradient(bx - 0.42 * W, 0, bx + 0.42 * W, 0);
    g.addColorStop(0, 'rgba(255,77,0,0)');
    g.addColorStop(0.5, 'rgba(255,77,0,0.3)');
    g.addColorStop(1, 'rgba(255,77,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const step = 5 * dpr;
    const h = Math.max(1, Math.round(dpr));
    let i = 0;
    for (let y = 0; y < H; y += step, i++) {
      ctx.globalAlpha = 0.03 + 0.04 * hash(i + 1);
      ctx.fillRect(Math.sin(t * 0.0007 + i * 0.9) * 3 * dpr - 4, y, W + 8, h);
    }
    ctx.globalAlpha = 1;
  };
  const loop = (t: number): void => {
    if (!running) return;
    draw(t);
    requestAnimationFrame(loop);
  };
  size();
  draw(0);
  new ResizeObserver(() => {
    size();
    draw(performance.now());
  }).observe(canvas);
  if (reduced) return;
  new IntersectionObserver((entries) => {
    const on = entries.some((e) => e.isIntersecting);
    if (on && !running) {
      running = true;
      requestAnimationFrame(loop);
    } else if (!on) running = false;
  }).observe(canvas);
}

// ---- Product plates: seeded horizontal bars drifting on a slow sine -----------------------------------------------
interface Bar { y: number; h: number; w: number; x: number; ph: number; orange: boolean; a: number }
function initPlates(canvases: HTMLCanvasElement[]): void {
  const plates = canvases.flatMap((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const seed = Number(canvas.dataset['plate'] ?? '1') * 17.3;
    const bars: Bar[] = Array.from({ length: 22 }, (_, i) => {
      const w = 0.25 + 0.7 * hash(seed + i * 3.1);
      return {
        y: (i + 0.5) / 22,
        h: 0.012 + 0.05 * hash(seed + i * 7.7),
        w,
        x: (1 - w) * hash(seed + i * 5.3),
        ph: hash(seed + i * 2.9) * 6.283,
        orange: i % 7 === 3,
        a: 0.1 + 0.4 * hash(seed + i * 1.7),
      };
    });
    return [{ canvas, ctx, bars, visible: false }];
  });
  const paint = (p: (typeof plates)[number], t: number): void => {
    const { canvas, ctx, bars } = p;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#0B0E14';
    ctx.fillRect(0, 0, W, H);
    for (const b of bars) {
      const dx = Math.sin(t * 0.00045 + b.ph) * 0.05;
      ctx.fillStyle = b.orange ? '#FF4D00' : `rgba(233,237,242,${b.a})`;
      ctx.fillRect((b.x + dx) * W, b.y * H, b.w * W, Math.max(1, b.h * H * 0.5));
    }
  };
  const size = (): void => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    for (const p of plates) {
      const r = p.canvas.getBoundingClientRect();
      p.canvas.width = Math.max(1, Math.round(r.width * dpr));
      p.canvas.height = Math.max(1, Math.round(r.height * dpr));
      paint(p, performance.now());
    }
  };
  size();
  addEventListener('resize', size, { passive: true });
  if (reduced) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = plates.find((x) => x.canvas === e.target);
      if (p) p.visible = e.isIntersecting;
    }
  });
  plates.forEach((p) => io.observe(p.canvas));
  const loop = (t: number): void => {
    for (const p of plates) if (p.visible) paint(p, t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function initPoster(): void {
  initReveal();
  initStages();
  const scan = document.querySelector<HTMLCanvasElement>('#scan');
  if (scan) initScan(scan);
  initPlates(Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-plate]')));
}
