// Poster landing: ONE rAF-throttled scroll handler writes --p on pinned stages; one IntersectionObserver reveals atoms;
// two small canvas painters (hero scan lines, product plates) only run while visible. No animation library.

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// ---- Scroll stages -------------------------------------------------------------------------------------------------
// Stage geometry is measured once (and on resize); each scroll frame is then pure arithmetic on scrollY followed by a few
// direct opacity/transform writes. No layout reads and no custom-property cascade during scroll.
interface Stage { el: HTMLElement; name: string; top: number; span: number; last: number }

function initStages(): void {
  const stages: Stage[] = Array.from(document.querySelectorAll<HTMLElement>('[data-stage]')).map((el) => ({
    el, name: el.dataset['stage'] ?? '', top: 0, span: 1, last: -1,
  }));
  const q = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
  const mark = q('[data-mark]');
  const claim = q('[data-claim]');
  const meta = q('[data-meta]');
  const meter = q('[data-meter]');
  const mask = q('[data-mask]');
  const cap = q('[data-cap]');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-row]'));
  const numEls = Array.from(document.querySelectorAll<HTMLElement>('[data-num]'));
  const tagEls = Array.from(document.querySelectorAll<HTMLElement>('[data-step]'));
  let current = -1;
  let queued = false;

  const stepLabel = (i: number): string => `${document.documentElement.lang === 'ro' ? 'PAS' : 'STEP'} ${i + 1}/${rows.length}`;
  const setIndex = (i: number, force = false): void => {
    if (i === current && !force) return;
    current = i;
    rows.forEach((row, k) => row.classList.toggle('on', k <= i));
    const num = rows[i]?.dataset['n'] ?? '001';
    numEls.forEach((el) => {
      const lead = el.querySelector('[data-lead]');
      const tail = el.querySelector('[data-tail]');
      if (lead) lead.textContent = num.slice(0, 1);
      if (tail) tail.textContent = num.slice(1);
    });
    tagEls.forEach((el) => (el.textContent = stepLabel(i)));
  };
  document.addEventListener('noir:lang', () => setIndex(Math.max(current, 0), true));

  const measure = (): void => {
    const vh = innerHeight;
    for (const s of stages) {
      const pin = s.el.firstElementChild as HTMLElement | null;
      s.top = s.el.getBoundingClientRect().top + scrollY;
      s.span = Math.max(1, s.el.offsetHeight - (pin ? pin.clientHeight : vh));
      s.last = -1;
    }
  };

  const apply = (s: Stage, p: number): void => {
    switch (s.name) {
      case 'hero':
        if (mark) { mark.style.opacity = String(clamp01(1 - p * 1.9)); mark.style.transform = `scale(${(1 - p * 0.34).toFixed(4)})`; }
        if (claim) claim.style.opacity = String(clamp01((p - 0.52) * 4));
        if (meta) meta.style.opacity = String(clamp01(1 - p * 3.2));
        break;
      case 'ladder':
        setIndex(Math.min(rows.length - 1, Math.floor(p * rows.length)));
        if (meter) meter.style.transform = `scaleX(${p.toFixed(4)})`;
        break;
      case 'whiteout':
        if (mask) mask.style.setProperty('--p', p.toFixed(4));
        if (cap) cap.style.opacity = String(clamp01(1 - p * 2.4));
        break;
    }
  };

  const update = (): void => {
    queued = false;
    const y = scrollY;
    const vh = innerHeight;
    for (const s of stages) {
      if (y + vh < s.top || y > s.top + s.span + vh) continue;
      const p = Math.round(clamp01((y - s.top) / s.span) * 2000) / 2000;
      if (p === s.last) continue;
      s.last = p;
      apply(s, p);
    }
  };
  const request = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  const remeasure = (): void => { measure(); request(); };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', remeasure, { passive: true });
  addEventListener('load', remeasure);
  if (document.fonts) void document.fonts.ready.then(remeasure);
  setIndex(0);
  measure();
  update();
}

// ---- ENTER transition ----------------------------------------------------------------------------------------------
function initEnter(): void {
  const root = document.documentElement;
  const go = (href: string): void => location.assign(href);
  document.querySelectorAll<HTMLAnchorElement>('a[data-enter]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (reduced) return go(a.href);
      if (root.classList.contains('leaving')) return;
      try { sessionStorage.setItem('noir-enter', '1'); } catch { /* storage may be blocked */ }
      root.classList.add('leaving');
      setTimeout(() => go(a.href), 1000);
    }),
  );
  // Back/forward cache: the page comes back frozen mid-transition.
  addEventListener('pageshow', (e) => { if (e.persisted) root.classList.remove('leaving'); });
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

// ---- Hero plate: scan lines, drawn once (the drifting orange bloom is a compositor-animated CSS layer) -------------
function initScan(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const draw = (): void => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const r = canvas.getBoundingClientRect();
    const W = (canvas.width = Math.max(1, Math.round(r.width * dpr)));
    const H = (canvas.height = Math.max(1, Math.round(r.height * dpr)));
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    const step = 5 * dpr;
    const h = Math.max(1, Math.round(dpr));
    let i = 0;
    for (let y = 0; y < H; y += step, i++) {
      ctx.globalAlpha = 0.03 + 0.04 * hash(i + 1);
      ctx.fillRect(0, y, W, h);
    }
    ctx.globalAlpha = 1;
  };
  draw();
  let w = canvas.clientWidth;
  let hgt = canvas.clientHeight;
  new ResizeObserver(() => {
    if (canvas.clientWidth === w && canvas.clientHeight === hgt) return;
    w = canvas.clientWidth;
    hgt = canvas.clientHeight;
    draw();
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
  // The loop only exists while at least one plate is on screen: a free-running rAF keeps the main thread producing frames.
  let running = false;
  let last = 0;
  const loop = (t: number): void => {
    if (!running) return;
    if (t - last >= 50) {
      last = t;
      for (const p of plates) if (p.visible) paint(p, t);
    }
    requestAnimationFrame(loop);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = plates.find((x) => x.canvas === e.target);
      if (p) p.visible = e.isIntersecting;
    }
    const any = plates.some((p) => p.visible);
    if (any && !running) {
      running = true;
      requestAnimationFrame(loop);
    } else if (!any) running = false;
  });
  plates.forEach((p) => io.observe(p.canvas));
}

export function initPoster(): void {
  initReveal();
  initStages();
  initEnter();
  const scan = document.querySelector<HTMLCanvasElement>('#scan');
  if (scan) initScan(scan);
  initPlates(Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-plate]')));
}
