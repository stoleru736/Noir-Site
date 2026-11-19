// Full-screen landing. Heavy work happens once (bake); per frame the GPU only draws one textured triangle plus
// a few thousand gold points, and the CPU only updates a tiny touch field while the user interacts.

const PRE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const VERT = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';

// Pass 1 (once): tileable dune heightmap. R: dunes, G: wind ripples.
const HEIGHT = PRE + `
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float pnoise(vec2 p,float per){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); vec2 a=mod(i,per),b=mod(i+1.,per);
  return mix(mix(hash(a),hash(vec2(b.x,a.y)),f.x),mix(hash(vec2(a.x,b.y)),hash(b),f.x),f.y); }
float pfbm(vec2 p,float per){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*pnoise(p,per); p*=2.; per*=2.; a*=.5; } return v; }
float prof(float s){ return smoothstep(0.,.8,s)*(1.-smoothstep(.8,1.,s)); }
void main(){
  vec2 uv=gl_FragCoord.xy/512.;
  float ph=uv.y*4.+pfbm(uv*3.,3.)*1.3;
  float amp=.6+.4*pnoise(uv*2.,2.);
  float h1=prof(fract(ph))*amp;
  float ph2=uv.y*9.+pfbm(uv*7.+3.,7.)*1.6;
  float h2=prof(fract(ph2))*(.5+.5*pnoise(uv*4.+5.,4.));
  float macro=(h1+h2*.2)/1.25;
  float rip=sin(uv.y*220.+pfbm(uv*16.,16.)*7.)*.5+.5;
  gl_FragColor=vec4(macro,rip,0.,1.);
}`;

// Pass 2 (once): the lit landscape in perspective, rendered into a texture. A: crest mask used for wind streaks.
const SCENE = PRE + `
uniform sampler2D uTex; uniform vec2 uRes;
void main(){
  vec2 suv=gl_FragCoord.xy/uRes; float asp=uRes.x/uRes.y;
  float dy=.72-suv.y;
  float z=.3/(max(dy,.0008)+.012);
  float near=exp(-z*.3);
  vec2 w=vec2((suv.x-.5)*asp*z*1.25,z);
  vec2 tc=w*.5;
  float e=.004;
  vec3 t0=texture2D(uTex,tc).rgb;
  float h=t0.r;
  float hx=texture2D(uTex,tc+vec2(e,0.)).r;
  float hz=texture2D(uTex,tc+vec2(0.,e)).r;
  float rip=texture2D(uTex,tc*7.).g;
  vec3 n=normalize(vec3(-(hx-h)/e*.5,1.,-(hz-h)/e*.5));
  n.xz+=vec2(.05,.4)*(rip-.5)*(.2+.8*near);
  n=normalize(n);
  vec3 L=normalize(vec3(-.75,.3,.55));
  float diff=max(dot(n,L),0.)*(1.+(rip-.5)*.7*(.3+.7*near));
  float hs=max(texture2D(uTex,tc+L.xz*.02).r,texture2D(uTex,tc+L.xz*.05).r*.9);
  float occ=clamp((hs-h)*9.-.04,0.,1.);
  float lit=diff*(1.-.75*occ);
  vec3 sun=vec3(1.,.9,.76);
  vec3 col=vec3(.21,.195,.18)*(sun*lit*3.1+vec3(.2,.205,.22));
  float fog=1.-exp(-z*.09);
  vec3 hzc=vec3(.14,.12,.1);
  col=mix(col,hzc,fog*.85);
  vec3 sky=mix(vec3(.03,.03,.034),hzc*1.05,exp(dy*10.)*.85);
  col=mix(sky,col,smoothstep(-.004,.004,dy));
  float crest=smoothstep(.4,.85,h)*(1.-occ)*step(0.,dy);
  gl_FragColor=vec4(col,crest);
}`;

// Per frame: scene texture + touch warp/shading + wind streaks. One scene fetch, three tiny touch fetches, two streak fetches.
const COMPOSITE = PRE + `
uniform sampler2D uScene; uniform sampler2D uDisp; uniform sampler2D uStreak;
uniform vec2 uTexel; uniform float uTime; uniform float uBurst;
varying vec2 vUv;
void main(){
  float dxp=texture2D(uDisp,vUv+vec2(uTexel.x,0.)).r-texture2D(uDisp,vUv-vec2(uTexel.x,0.)).r;
  float dyp=texture2D(uDisp,vUv+vec2(0.,uTexel.y)).r-texture2D(uDisp,vUv-vec2(0.,uTexel.y)).r;
  float d0=(texture2D(uDisp,vUv).r-.5)*2.;
  vec2 c=vec2(.5,.4);
  vec2 uv=c+(vUv-c)*(1.-uBurst*.5)+vec2(dxp,dyp)*.05;
  vec4 s=texture2D(uScene,uv);
  vec3 col=s.rgb*clamp(1.+(dxp*.75-dyp*.5)*9.,.2,2.2)*(1.-clamp(-d0*.7,0.,.6));
  float nearK=1.-smoothstep(0.,.72,vUv.y);
  float a=texture2D(uStreak,vec2(vUv.x*.55-uTime*.16,vUv.y*7.)).r;
  float b=texture2D(uStreak,vec2(vUv.x*.8-uTime*.07+.3,vUv.y*11.+.4)).r;
  float st=smoothstep(.55,.85,mix(b,a,nearK))*(s.a*.95+.12*nearK);
  col+=vec3(.3,.26,.2)*st;
  col=mix(col,vec3(.043),smoothstep(.55,1.,uBurst));
  vec2 vv=vUv-.5; col*=1.-.4*dot(vv,vv);
  gl_FragColor=vec4(col,1.);
}`;

// Gold sand: each grain wanders on its own random path (sum of sines with per-grain phase/frequency) and drags a short
// tail. Everything is computed on the GPU from time; each grain is a 2-vertex line (head, tail) plus a point for the head.
const PVERT = `
attribute vec4 a;
uniform float uTime; uniform float uBurst; uniform float uPx; uniform float uAsp; uniform vec3 uTouch[3];
varying float vA;
float h(float n){ return fract(sin(n*127.1)*43758.5453); }
vec2 place(vec3 s,float t){
  float r1=h(s.x*91.7+s.y*13.3), r2=h(s.y*57.1+s.z*31.7), r3=h(s.z*17.9+s.x*71.3), r4=h(s.x*33.1+s.z*5.7);
  vec2 home=vec2(s.x,.03+s.y*.68);
  float f1=.4+r1*1.3, f2=.35+r2*1.4, A=.03+.09*r3;
  vec2 w=vec2(sin(t*f1+r4*6.283)+.5*sin(t*f1*2.3+r1*12.),cos(t*f2+r1*6.283)+.5*cos(t*f2*1.9+r2*12.))*A;
  w.x/=uAsp;
  return home+w;
}
void main(){
  vec2 p=place(a.xyz,uTime-a.w*.07);
  for(int i=0;i<3;i++){
    vec3 t=uTouch[i];
    vec2 d=vec2((p.x-t.x)*uAsp,p.y-t.y);
    float r=length(d)+.001;
    p+=d/r*t.z*exp(-r*r*16.)*.14;
  }
  p+=(p-vec2(.5,.4))*uBurst*uBurst*1.4;
  gl_Position=vec4(p*2.-1.,0.,1.);
  gl_PointSize=a.w>.5?0.:uPx*(1.3+2.8*a.z*a.z);
  float edge=smoothstep(-.02,.03,p.x)*smoothstep(1.02,.97,p.x);
  vA=(.3+.7*a.z)*(.55+.45*sin(uTime*(2.+a.z*3.)+a.x*90.))*edge*(1.-a.w)*(1.-smoothstep(.6,1.,uBurst));
}`;
const PFRAG = PRE + `
varying float vA;
void main(){
  float d=length(gl_PointCoord-.5)*2.;
  float a=smoothstep(1.,.15,d)*vA;
  gl_FragColor=vec4(vec3(1.,.8,.45)*a,a);
}`;
const LFRAG = PRE + `
varying float vA;
void main(){
  float a=vA*.6;
  gl_FragColor=vec4(vec3(1.,.8,.45)*a,a);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
  return s;
}
function program(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vert), fs = compile(gl, gl.FRAGMENT_SHADER, frag), pr = gl.createProgram();
  if (!vs || !fs || !pr) return null;
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.bindAttribLocation(pr, 0, vert === PVERT ? 'a' : 'p'); gl.linkProgram(pr);
  return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null;
}

export function initLanding(landing: HTMLElement, canvas: HTMLCanvasElement, enter: HTMLAnchorElement): void {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const dprCap = coarse ? 1 : 1.25;
  const budget = coarse ? 320000 : 700000; // render-buffer pixels, upscaled by CSS
  const maxParticles = reduced ? 600 : coarse ? 1600 : 3200;

  // ---- entering the store: only via the button/link ----
  let entering = false;
  const BURST_MS = 1100;
  let burstStart = -1;
  enter.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (entering) return;
    entering = true;
    if (reduced) { location.assign(enter.href); return; }
    burstStart = performance.now();
    landing.classList.add('leaving');
    setTimeout(() => location.assign(enter.href), BURST_MS);
  });
  addEventListener('pageshow', (e) => {
    if (e.persisted) { entering = false; burstStart = -1; landing.classList.remove('leaving'); }
  });

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) return;
  const hP = program(gl, VERT, HEIGHT), sP = program(gl, VERT, SCENE), cP = program(gl, VERT, COMPOSITE), pP = program(gl, PVERT, PFRAG), lP = program(gl, PVERT, LFRAG);
  if (!hP || !sP || !cP || !pP || !lP) return;
  const heightProg: WebGLProgram = hP, sceneProg: WebGLProgram = sP, compProg: WebGLProgram = cP, partProg: WebGLProgram = pP, lineProg: WebGLProgram = lP;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const seeds = new Float32Array(maxParticles * 2 * 4);
  for (let i = 0; i < maxParticles; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    seeds.set([x, y, z, 0, x, y, z, 1], i * 8);
  }
  const pBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

  // Tiling noise for the wind streaks (stretched horizontally by the sampling coordinates).
  const streak = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, streak);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const sn = new Uint8Array(256 * 64);
  for (let i = 0; i < sn.length; i++) sn[i] = Math.random() * 255;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 64, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, sn);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const uc = (n: string) => gl.getUniformLocation(cP, n);
  const up = (n: string) => gl.getUniformLocation(pP, n);
  const ul = (n: string) => gl.getUniformLocation(lP, n);
  const cTexel = uc('uTexel'), cTime = uc('uTime'), cBurst = uc('uBurst');
  const pTime = up('uTime'), pBurst = up('uBurst'), pPx = up('uPx'), pAsp = up('uAsp'), pTouch = up('uTouch[0]');
  const lTime = ul('uTime'), lBurst = ul('uBurst'), lPx = ul('uPx'), lAsp = ul('uAsp'), lTouch = ul('uTouch[0]');
  gl.useProgram(cP);
  gl.uniform1i(uc('uScene'), 0); gl.uniform1i(uc('uDisp'), 1); gl.uniform1i(uc('uStreak'), 2);

  // ---- state shared with the (re)build ----
  let cssW = 1, cssH = 1, gw = 1, gh = 1, bufW = 1, bufH = 1;
  let field = new Float32Array(1), out = new Uint8Array(1);
  let sceneTex: WebGLTexture | null = null, dispTex: WebGLTexture | null = null;
  let particles = maxParticles;
  let bakeMs = 0;

  function bake() {
    const t0 = performance.now();
    gl!.disable(gl!.BLEND);
    const hTex = gl!.createTexture();
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, hTex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 512, 512, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    const fbo = gl!.createFramebuffer();
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, hTex, 0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
    gl!.enableVertexAttribArray(0);
    gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
    gl!.viewport(0, 0, 512, 512);
    gl!.useProgram(heightProg);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.bindTexture(gl!.TEXTURE_2D, hTex);
    gl!.generateMipmap(gl!.TEXTURE_2D);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.REPEAT);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.REPEAT);

    if (sceneTex) gl!.deleteTexture(sceneTex);
    sceneTex = gl!.createTexture();
    gl!.activeTexture(gl!.TEXTURE3);
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, bufW, bufH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, sceneTex, 0);
    gl!.viewport(0, 0, bufW, bufH);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.useProgram(sceneProg);
    gl!.uniform1i(gl!.getUniformLocation(sceneProg, 'uTex'), 0);
    gl!.uniform2f(gl!.getUniformLocation(sceneProg, 'uRes'), bufW, bufH);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.deleteFramebuffer(fbo);
    gl!.deleteTexture(hTex);
    gl!.finish();
    bakeMs = performance.now() - t0;

    // scene on unit 0 for the per-frame pass
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, sceneTex);

    // touch displacement field
    gw = Math.min(128, Math.ceil(cssW / 14)); gh = Math.min(192, Math.ceil(cssH / 14));
    field = new Float32Array(gw * gh);
    out = new Uint8Array(gw * gh).fill(128);
    if (dispTex) gl!.deleteTexture(dispTex);
    dispTex = gl!.createTexture();
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, dispTex);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.LUMINANCE, gw, gh, 0, gl!.LUMINANCE, gl!.UNSIGNED_BYTE, out);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.useProgram(compProg);
    gl!.uniform2f(cTexel, 1 / gw, 1 / gh);
  }

  function build() {
    cssW = Math.max(1, landing.clientWidth); cssH = Math.max(1, landing.clientHeight);
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    const s = Math.min(1, Math.sqrt(budget / (cssW * cssH * dpr * dpr)));
    bufW = Math.max(2, Math.round(cssW * dpr * s)); bufH = Math.max(2, Math.round(cssH * dpr * s));
    canvas.width = bufW; canvas.height = bufH;
    bake();
    gl!.viewport(0, 0, bufW, bufH);
  }
  build();
  let rt = 0, lastW = cssW, lastH = cssH;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      // ignore mobile address-bar jitter: CSS just stretches the baked scene
      if (Math.abs(landing.clientWidth - lastW) < 40 && Math.abs(landing.clientHeight - lastH) < 120) return;
      lastW = landing.clientWidth; lastH = landing.clientHeight;
      build();
    }, 200);
  });

  // ---- touch / mouse ----
  const clock0 = performance.now();
  const clock = () => ((performance.now() - clock0) / 1000) * (reduced ? 0.35 : 1);
  const ripples: { x: number; y: number; t: number }[] = [];
  const active = new Map<number, { x: number; y: number; sx: number; sy: number; st: number }>();
  let lastInput = -1e9;
  let mouse: { x: number; y: number; t: number } | null = null;
  const toGrid = (cx: number, cy: number) => ({ x: (cx / cssW) * gw, y: (1 - cy / cssH) * gh });

  function trail(cx: number, cy: number) {
    const g = toGrid(cx, cy), rad = 2.4;
    for (let j = Math.max(0, Math.floor(g.y - 4)); j <= Math.min(gh - 1, Math.ceil(g.y + 4)); j++) {
      for (let i = Math.max(0, Math.floor(g.x - 4)); i <= Math.min(gw - 1, Math.ceil(g.x + 4)); i++) {
        const d2 = (i - g.x) ** 2 + (j - g.y) ** 2, k = j * gw + i;
        field[k] = Math.max(-1, field[k]! - 0.8 * Math.exp(-d2 / (rad * rad)));
      }
    }
    lastInput = performance.now();
  }
  function ripple(cx: number, cy: number) {
    const g = toGrid(cx, cy);
    ripples.push({ x: g.x, y: g.y, t: performance.now() });
    if (ripples.length > 4) ripples.shift();
    lastInput = performance.now();
  }
  const inLink = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('a,button');
  landing.addEventListener('touchstart', (e) => {
    for (let k = 0; k < e.touches.length && k < 3; k++) {
      const t = e.touches[k]!;
      if (!active.has(t.identifier)) active.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, st: performance.now() });
      trail(t.clientX, t.clientY);
    }
  }, { passive: true });
  landing.addEventListener('touchmove', (e) => {
    for (let k = 0; k < e.touches.length && k < 3; k++) {
      const t = e.touches[k]!, s = active.get(t.identifier);
      if (!s) continue;
      if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > 8) { trail(t.clientX, t.clientY); s.x = t.clientX; s.y = t.clientY; }
      else { s.x = t.clientX; s.y = t.clientY; }
    }
  }, { passive: true });
  const endTouch = (e: TouchEvent) => {
    for (let k = 0; k < e.changedTouches.length; k++) {
      const t = e.changedTouches[k]!, s = active.get(t.identifier);
      if (!s) continue;
      const tap = Math.hypot(t.clientX - s.sx, t.clientY - s.sy) < 12 && performance.now() - s.st < 350;
      if (tap && !inLink(e.target)) ripple(t.clientX, t.clientY);
      active.delete(t.identifier);
    }
  };
  landing.addEventListener('touchend', endTouch, { passive: true });
  landing.addEventListener('touchcancel', endTouch, { passive: true });
  let lm = 0;
  landing.addEventListener('mousemove', (e) => {
    mouse = { x: e.clientX, y: e.clientY, t: performance.now() };
    const n = performance.now();
    if (n - lm > 30) { lm = n; trail(e.clientX, e.clientY); }
  });
  landing.addEventListener('mouseleave', () => { mouse = null; });
  landing.addEventListener('click', (e) => { if (e.detail > 0 && !inLink(e.target)) ripple(e.clientX, e.clientY); });

  const touchU = new Float32Array(9);
  function packTouches(now: number) {
    touchU.fill(0);
    let n = 0;
    for (const s of active.values()) {
      if (n >= 3) break;
      touchU[n * 3] = s.x / cssW; touchU[n * 3 + 1] = 1 - s.y / cssH; touchU[n * 3 + 2] = 1; n++;
    }
    if (mouse && n < 3 && now - mouse.t < 1500) {
      touchU[n * 3] = mouse.x / cssW; touchU[n * 3 + 1] = 1 - mouse.y / cssH; touchU[n * 3 + 2] = 0.8; n++;
    }
    for (let k = ripples.length - 1; k >= 0 && n < 3; k--) {
      const r = ripples[k]!, age = (now - r.t) / 1000;
      touchU[n * 3] = r.x / gw; touchU[n * 3 + 1] = r.y / gh; touchU[n * 3 + 2] = Math.max(0, 1 - age * 1.2); n++;
    }
  }

  let dirty = false;
  function updateField(now: number, dt: number) {
    const live = ripples.length > 0 || now - lastInput < 4000;
    if (!live && !dirty) return;
    const decay = Math.exp(-dt * 0.7);
    for (let k = ripples.length - 1; k >= 0; k--) if (now - ripples[k]!.t > 3000) ripples.splice(k, 1);
    let peak = 0;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        const f = field[k]! * decay;
        field[k] = f;
        let v = f;
        for (let r = 0; r < ripples.length; r++) {
          const rp = ripples[r]!, age = (now - rp.t) / 1000;
          const x = (Math.hypot(i - rp.x, j - rp.y) - age * 9) / 1.7;
          v += 0.5 * Math.exp(-age * 1.3) * Math.exp(-x * x) * Math.cos(x * 2);
        }
        if (Math.abs(f) > peak) peak = Math.abs(f);
        out[k] = Math.max(0, Math.min(255, Math.round(128 + 127 * v)));
      }
    }
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.texSubImage2D(gl!.TEXTURE_2D, 0, 0, 0, gw, gh, gl!.LUMINANCE, gl!.UNSIGNED_BYTE, out);
    dirty = ripples.length > 0 || peak > 0.004;
  }

  // ---- frame loop ----
  let running = true, frames = 0, acc = 0, prev = 0, lastFrame = 0;
  let firstDrawn = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); running = false; landing.classList.remove('gl'); });
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!running || document.hidden) { prev = 0; lastFrame = 0; return; }
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    if (prev) {
      acc += now - prev; frames++;
      if (frames === 60) {
        if (acc / frames > 20 && particles > 500) particles = Math.max(500, Math.round(particles * 0.7));
        frames = 0; acc = 0;
      }
    }
    prev = now;
    updateField(now, dt);
    const burst = burstStart < 0 ? 0 : Math.min(1, (now - burstStart) / BURST_MS);
    const eased = burst * burst * (3 - 2 * burst);
    const t = clock();

    const g = gl!;
    g.disable(g.BLEND);
    g.useProgram(compProg);
    g.bindBuffer(g.ARRAY_BUFFER, quad);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.uniform1f(cTime, t);
    g.uniform1f(cBurst, eased);
    g.drawArrays(g.TRIANGLES, 0, 3);

    packTouches(now);
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE);
    g.bindBuffer(g.ARRAY_BUFFER, pBuf);
    g.vertexAttribPointer(0, 4, g.FLOAT, false, 0, 0);
    const px = Math.max(1, bufW / cssW) * (coarse ? 1.3 : 1.1), asp = cssW / cssH;
    g.useProgram(lineProg);
    g.uniform1f(lTime, t); g.uniform1f(lBurst, eased); g.uniform1f(lPx, px); g.uniform1f(lAsp, asp); g.uniform3fv(lTouch, touchU);
    g.drawArrays(g.LINES, 0, particles * 2);
    g.useProgram(partProg);
    g.uniform1f(pTime, t); g.uniform1f(pBurst, eased); g.uniform1f(pPx, px); g.uniform1f(pAsp, asp); g.uniform3fv(pTouch, touchU);
    g.drawArrays(g.POINTS, 0, particles * 2);

    if (!firstDrawn) { firstDrawn = true; landing.classList.add('gl'); canvas.classList.add('on'); }
  };
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { prev = 0; lastFrame = 0; });
  // Exposed for performance checks in the browser console / tests; read-only numbers.
  (window as unknown as { __landingStats?: () => object }).__landingStats = () => ({ bakeMs, particles, bufW, bufH });
}
