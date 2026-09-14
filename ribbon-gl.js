/* Zstore AI — "One Ribbon" stage. Hand-written WebGL2, zero dependencies.
   One fixed canvas paints the page ground (dark stage / paper with twisting ribbon seams),
   a real-time enamel + chrome ribbon mesh, and DOM-synced planes (hero type, portrait)
   depth-tested against it so the ribbon can pass in front of and behind them.
   Poses: hero figure-eight → work sculpture → expertise bookmark → studio ring → the Z fold.
   Phones and stacked layouts never slide a morph across the page: the old pose folds away
   into its own anchor and the next one unfolds from its anchor, so no text is ever covered.
   Post: MSAA resolve (dropped on slow devices), half-resolution mip bloom, highlight-only fringe, grain, vignette. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const SRC = document.currentScript && document.currentScript.src;
  const doc = document.documentElement;
  const canvas = document.getElementById('stage');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || innerWidth < 760;
  let motion = !doc.classList.contains('motion-off');

  const api = window.ZStage = { live: false, setMotion() {}, hover() {}, setPaused() {}, flip() {} };

  const gl = canvas && canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) { doc.classList.add('no-gl'); return; }
  // Software rasterizers (SwiftShader, llvmpipe, Basic Render Driver) render this stage on the
  // CPU at slideshow speed — the designed static fallback is the better experience there.
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) { doc.classList.add('no-gl'); return; }
  } catch (e) {}

  /* ------------------------------------------------------------------ shaders */
  const FS_TRI = `#version 300 es
  void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;

  // Alpha channel convention for the post pass: 0.5 = plain ground, (0.5..1] = highlight (bloom/fringe),
  // towards 0 = DOM planes (type, portrait), which are kept free of grain and fringe.
  const BG_FS = `#version 300 es
  precision highp float;
  uniform vec2 uRes; uniform float uDpr; uniform float uTime;
  uniform vec4 uB[4]; uniform float uTopTheme;
  uniform vec3 uGlow; uniform float uAmp;
  out vec4 o;
  const vec3 DARK = vec3(0.047,0.039,0.035);
  const vec3 PAPER = vec3(0.925,0.898,0.851);
  const vec3 ENAMEL = vec3(0.886,0.322,0.122);
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main(){
    vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    float xc = fc.x / uDpr;
    float theme = uTopTheme;
    vec3 rim = vec3(0.0); float rimA = 0.0; float shadow = 0.0;
    for (int i = 0; i < 4; i++) {
      if (uB[i].z < 0.5) continue;
      float fi = float(i);
      float wave = uAmp * (0.62*sin(xc*0.0031 + uTime*0.21 + fi*1.3) + 0.38*sin(xc*0.0077 - uTime*0.16 + fi*2.1));
      float d = (fc.y / uDpr) - uB[i].x - wave;
      theme = mix(theme, uB[i].y, clamp(d*uDpr + 0.5, 0.0, 1.0));
      float ph = xc*0.0042 + uTime*0.33 + fi*0.9;
      float tw = cos(ph);
      float hw = 1.0 + 12.0*abs(tw);
      float q = d / hw;
      float a = clamp((hw - abs(d))*uDpr + 0.5, 0.0, 1.0);
      if (a > 0.0) {
        float qq = clamp(q, -1.0, 1.0);
        float body = sqrt(1.0 - qq*qq*0.9);
        vec3 c;
        if (tw > 0.0) {
          float spec = exp(-pow((qq + 0.35*sin(ph*1.7))*3.2, 2.0));
          c = ENAMEL*(0.52 + 0.5*body - 0.18*qq) + vec3(1.0,0.93,0.86)*spec*0.75*(0.35+0.65*abs(tw));
        } else {
          float s = 0.5 + 0.5*sin(qq*3.6 + ph*2.3 + 1.2);
          c = mix(vec3(0.10,0.09,0.085), vec3(0.97,0.95,0.92), smoothstep(0.38, 0.8, s));
          c = mix(c, ENAMEL, 0.12*(1.0-s));
          c *= 0.7 + 0.3*body;
        }
        rim = mix(rim, c, a); rimA = max(rimA, a);
      }
      shadow = max(shadow, uB[i].y * smoothstep(0.0, 1.0, d) * exp(-max(d - hw, 0.0)/22.0) * 0.16 * step(0.0, d));
    }
    vec3 bg = mix(DARK, PAPER, theme);
    vec2 g = (fc - uGlow.xy) / max(uGlow.z, 1.0);
    bg += (1.0 - theme) * vec3(0.62,0.22,0.08) * 0.10 * exp(-dot(g, g)*1.4);
    bg += (1.0 - theme) * vec3(0.05,0.045,0.04) * exp(-pow(fc.y/uRes.y*1.6, 2.0));
    bg *= 1.0 - shadow;
    bg += (hash(fc*0.5) - 0.5) * 0.006;
    o = vec4(mix(bg, rim, rimA), 0.5 + rimA * 0.11);
  }`;

  const RIB_VS = `#version 300 es
  layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUv;
  uniform mat4 uPV; out vec3 vPos; out vec3 vN; out vec2 vUv;
  void main(){ vPos = aPos; vN = aNrm; vUv = aUv; gl_Position = uPV * vec4(aPos, 1.0); }`;

  const RIB_FS = `#version 300 es
  precision highp float;
  in vec3 vPos; in vec3 vN; in vec2 vUv;
  uniform vec3 uCam; uniform vec3 uEnamel; uniform vec3 uMetal; uniform float uLight; uniform vec2 uRot;
  uniform float uStreaks; uniform vec4 uMask; uniform float uResY;
  out vec4 o;
  mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
  mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  vec3 env(vec3 d){
    d = rotY(uRot.x) * rotX(uRot.y) * d;
    float y = d.y;
    vec3 sky = mix(vec3(0.09,0.078,0.07), vec3(1.05,1.0,0.94), uLight);
    vec3 gnd = mix(vec3(0.004,0.0035,0.003), vec3(0.20,0.17,0.15), uLight);
    vec3 c = mix(gnd, sky, smoothstep(-0.3, 0.7, y));
    c *= 1.0 - 0.9*exp(-pow((y + 0.04)*8.0, 2.0));
    c += vec3(1.0,0.88,0.78) * exp(-pow((y - 0.06)*38.0, 2.0)) * mix(0.9, 0.35, uLight);
    float k = dot(d, normalize(vec3(-0.5, 0.72, 0.48)));
    c += vec3(1.0,0.96,0.9) * smoothstep(0.90, 0.968, k) * 3.4;
    float az = atan(d.x, d.z);
    c += vec3(1.0,0.95,0.9) * smoothstep(0.075, 0.03, abs(az + 0.38)) * smoothstep(-0.25, 0.05, y) * smoothstep(0.85, 0.5, y) * 2.2;
    c += uStreaks * vec3(1.0,0.9,0.82) * smoothstep(0.16, 0.08, abs(az - 0.42)) * smoothstep(0.0, 0.25, y) * smoothstep(0.95, 0.7, y) * 1.3;
    c += uStreaks * vec3(1.0,0.9,0.8) * smoothstep(0.17, 0.05, abs(az - 1.7)) * smoothstep(-0.35, -0.05, y) * smoothstep(0.95, 0.55, y) * 2.4;
    c += uStreaks * vec3(0.78,0.84,1.0) * smoothstep(0.1, 0.03, abs(az + 2.25)) * smoothstep(-0.1, 0.15, y) * smoothstep(0.8, 0.45, y) * 1.2;
    c += uStreaks * vec3(0.9,0.85,0.8) * smoothstep(0.05, 0.015, abs(az + 0.55)) * smoothstep(0.1, 0.3, y) * smoothstep(0.9, 0.6, y) * 1.4;
    c += vec3(0.95,0.35,0.12) * smoothstep(-0.15, -0.9, y) * mix(0.3, 0.1, uLight);
    return c;
  }
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
  void main(){
    // the ribbon never paints under the portrait's name tag
    vec2 sp = vec2(gl_FragCoord.x, uResY - gl_FragCoord.y);
    if (uMask.z > uMask.x && sp.x > uMask.x && sp.x < uMask.z && sp.y > uMask.y && sp.y < uMask.w) discard;
    vec3 V = normalize(uCam - vPos);
    vec3 N = normalize(vN);
    bool front = !gl_FrontFacing;
    if (!front) N = -N;
    if (dot(N, V) < 0.0) N = normalize(N - V * dot(N, V) * 1.02);
    float NoV = clamp(dot(N, V), 0.0, 1.0);
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - NoV, 5.0);
    float edge = abs(vUv.y);
    vec3 col;
    if (front && edge < 0.93) {
      vec3 L = normalize(vec3(-0.5, 0.72, 0.48));
      float key = max(dot(N, L), 0.0);
      float wrap = max(dot(N, normalize(vec3(0.8, 0.1, 0.6))) * 0.5 + 0.5, 0.0);
      vec3 base = uEnamel * (0.16 + 0.95*key + 0.22*wrap);
      base += uEnamel * uEnamel * 0.9 * pow(1.0 - NoV, 2.0);
      float F = 0.04 + 0.96*fres;
      col = base * (1.0 - F) + env(R) * (F + 0.03);
    } else {
      vec3 F = uMetal + (1.0 - uMetal) * fres;
      col = env(R) * F;
      col += uEnamel * (front ? 0.08 : 0.22) * (0.35 + 0.65*smoothstep(0.2, 1.0, edge));
    }
    col *= mix(mix(0.42, 1.0, smoothstep(-2.6, 0.9, vPos.z)), 1.0, uLight*0.6);
    col = aces(col * 1.08);
    col = pow(col, vec3(1.0/2.2));
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    o = vec4(col, 0.5 + 0.5*smoothstep(0.72, 1.0, lum));
  }`;

  const PLANE_VS = `#version 300 es
  layout(location=0) in vec2 aQ;
  uniform vec4 uRect; uniform mat4 uPV; out vec2 vQ;
  void main(){ vQ = aQ; vec3 p = vec3(uRect.x + aQ.x*uRect.z, uRect.y - aQ.y*uRect.w, 0.0); gl_Position = uPV * vec4(p, 1.0); }`;

  // Planes test against the ribbon with a chosen depth: the hero type can sit "in front" of most
  // of the ribbon (uDepth), and the portrait's face region is always nearest, so the ribbon
  // can only ever pass behind Zvi's head.
  const PLANE_FS = `#version 300 es
  precision highp float;
  in vec2 vQ; uniform sampler2D uTex; uniform int uKind; uniform vec2 uSize; uniform float uRadius; uniform float uDpr;
  uniform vec3 uColor; uniform float uImgAspect; uniform float uDepth; uniform vec4 uFace; out vec4 o;
  void main(){
    if (uKind == 0) {
      float a = texture(uTex, vQ).a;
      o = vec4(uColor * a, a);
      gl_FragDepth = uDepth;
    } else {
      float boxA = uSize.x / uSize.y; vec2 uv = vQ;
      if (boxA > uImgAspect) uv.y = 0.5 + (uv.y - 0.5) * (uImgAspect / boxA);
      else uv.x = 0.5 + (uv.x - 0.5) * (boxA / uImgAspect);
      vec3 c = texture(uTex, uv).rgb;
      vec2 p = (vQ - 0.5) * uSize; vec2 q = abs(p) - (uSize*0.5 - uRadius);
      float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
      float a = clamp(0.5 - d*uDpr, 0.0, 1.0);
      o = vec4(c * a, a);
      vec2 fd = (uv - uFace.xy) / uFace.zw;
      gl_FragDepth = dot(fd, fd) < 1.0 ? 0.0 : gl_FragCoord.z;
    }
  }`;

  const POST_FS = `#version 300 es
  precision highp float;
  uniform sampler2D uScene; uniform sampler2D uHalf; uniform vec2 uRes; uniform float uTime; uniform float uAberr; uniform float uGrain; uniform float uVig; uniform float uBloom;
  out vec4 o;
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hl(float a){ return clamp((a - 0.5) * 2.0, 0.0, 1.0); }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    vec4 s0 = texture(uScene, uv);
    vec2 dc = uv - 0.5; float r2 = dot(dc, dc);
    vec3 c = s0.rgb;
    if (uAberr > 0.0) {
      float m = hl(s0.a);
      vec2 off = dc * uAberr * (0.3 + r2 * 3.0) * m;
      c = vec3(texture(uScene, uv + off).r, s0.g, texture(uScene, uv - off).b);
    }
    // bloom reads a half-resolution copy: lod 2/4/5.5 there equals lod 3/5/6.5 of the full frame
    vec4 b1 = textureLod(uHalf, uv, 2.0), b2 = textureLod(uHalf, uv, 4.0), b3 = textureLod(uHalf, uv, 5.5);
    vec3 bloom = b1.rgb*hl(b1.a)*0.55 + b2.rgb*hl(b2.a)*0.8 + b3.rgb*hl(b3.a)*0.9;
    c += bloom * uBloom;
    // vignette and full grain only on the dark stage: paper and type stay clean and match CSS paper
    float dark = 1.0 - smoothstep(0.42, 0.8, dot(s0.rgb, vec3(0.299, 0.587, 0.114)));
    c *= 1.0 - uVig * smoothstep(0.12, 0.62, r2) * dark;
    float n = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 517.0) - 0.5;
    c += n * uGrain * smoothstep(0.15, 0.5, s0.a) * mix(0.15, 1.0, dark);
    o = vec4(c, 1.0);
  }`;

  // No status query at compile time: querying would force the compile to finish synchronously.
  // Failures surface at link time instead, inside buildPrograms.
  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }
  const nextTask = () => new Promise((r) => setTimeout(r, 0));
  // The whole pipeline is built in many small tasks: every shader compile, every link and every
  // status check yields to the main thread first, and drivers with KHR_parallel_shader_compile
  // are polled so the heavy compile itself never blocks. Software renderers (no extension,
  // work done inside compile/link calls) still pay each step in its own short task.
  async function buildPrograms() {
    const ext = gl.getExtension('KHR_parallel_shader_compile');
    const SRCS = { bg: [FS_TRI, BG_FS], rib: [RIB_VS, RIB_FS], plane: [PLANE_VS, PLANE_FS], post: [FS_TRI, POST_FS] };
    const raw = {};
    for (const [k, [vs, fs]] of Object.entries(SRCS)) {
      const v = compile(gl.VERTEX_SHADER, vs);
      await nextTask();
      const f = compile(gl.FRAGMENT_SHADER, fs);
      await nextTask();
      const p = gl.createProgram();
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      raw[k] = p;
      await nextTask();
    }
    if (ext) {
      const t0 = performance.now();
      for (const p of Object.values(raw)) {
        while (!gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR) && performance.now() - t0 < 4000) {
          await new Promise((r) => setTimeout(r, 24));
        }
      }
    }
    const out = {};
    for (const [k, p] of Object.entries(raw)) {
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); throw new Error('link'); }
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
      out[k] = { p, u };
      await nextTask();
    }
    return out;
  }
  let P = null;

  const emptyVao = gl.createVertexArray();

  /* ------------------------------------------------------------------ ribbon mesh */
  const NS = mobile ? 200 : 440;   // samples along the ribbon
  const M = mobile ? 5 : 11;       // samples across
  const VCOUNT = NS * M;
  const vdata = new Float32Array(VCOUNT * 8);
  const ribVao = gl.createVertexArray();
  gl.bindVertexArray(ribVao);
  const ribBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf);
  gl.bufferData(gl.ARRAY_BUFFER, vdata.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  const idx = new Uint16Array((NS - 1) * (M - 1) * 6);
  { let k = 0; for (let i = 0; i < NS - 1; i++) for (let j = 0; j < M - 1; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = a + 1, d = b + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = c; idx[k++] = b; idx[k++] = d; } }
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* ------------------------------------------------------------------ curve helpers */
  const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const smoother = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * k * (k * (k * 6 - 15) + 10); };
  const CAP = 1600;
  const ctrl = new Float32Array(CAP * 2), bufA = new Float32Array(CAP * 2), bufB = new Float32Array(CAP * 2), cum = new Float32Array(CAP + 1);
  const res2 = new Float32Array(NS * 2);
  function chaikin(n, closed, iters) { // smooths ctrl[0..n) → returns [array, count]
    let src = ctrl, dst = bufA, na = n;
    for (let it = 0; it < iters; it++) {
      let m = 0; const segs = closed ? na : na - 1;
      if (!closed) { dst[m++] = src[0]; dst[m++] = src[1]; }
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % na, x0 = src[i * 2], y0 = src[i * 2 + 1], x1 = src[j * 2], y1 = src[j * 2 + 1];
        dst[m++] = x0 * 0.75 + x1 * 0.25; dst[m++] = y0 * 0.75 + y1 * 0.25;
        dst[m++] = x0 * 0.25 + x1 * 0.75; dst[m++] = y0 * 0.25 + y1 * 0.75;
      }
      if (!closed) { dst[m++] = src[(na - 1) * 2]; dst[m++] = src[(na - 1) * 2 + 1]; }
      na = m / 2; src = dst; dst = dst === bufA ? bufB : bufA;
    }
    return [src, na];
  }
  function resample(src, n, closed, out) { // arc-length resampling into NS points
    const segs = closed ? n : n - 1; cum[0] = 0;
    for (let i = 0; i < segs; i++) { const j = (i + 1) % n; cum[i + 1] = cum[i] + Math.hypot(src[j * 2] - src[i * 2], src[j * 2 + 1] - src[i * 2 + 1]); }
    const L = cum[segs]; let s = 0;
    for (let k = 0; k < NS; k++) {
      const target = k / (NS - 1) * L;
      while (s < segs - 1 && cum[s + 1] < target) s++;
      const j = (s + 1) % n, f = (target - cum[s]) / Math.max(1e-6, cum[s + 1] - cum[s]);
      out[k * 2] = src[s * 2] + (src[j * 2] - src[s * 2]) * f;
      out[k * 2 + 1] = src[s * 2 + 1] + (src[j * 2 + 1] - src[s * 2 + 1]) * f;
    }
    return L;
  }

  /* ------------------------------------------------------------------ the Z: a ribbon folded flat twice
     Same geometry as the Zstore AI mark (32-unit box, 45° creases): top bar, diagonal, bottom bar.
     Each part is a flat strip whose ends are cut on the crease line, so the folds are razor-clean.
     The diagonal's strip runs the other way round, which shows the ribbon's chrome reverse face. */
  const ZT = 6.0, ZXA = 27.6 - ZT / Math.SQRT2, ZXB = ZXA - ZT + ZT * Math.SQRT2, ZDX = -23.2 + ZT;
  const zRows = new Float32Array(NS * 4), zMid = new Float32Array(NS * 2), zTw = new Float32Array(NS), zRowSeg = new Uint8Array(NS);
  const zSegN = [0, 0, 0], zSegP = [0, 0, 0, 0, 0, 0];
  {
    const U = (mx, my) => [(mx - 16) / 12, (16 - my) / 12];
    const segs = [
      [U(4, 4.4), U(ZXA, 4.4), U(4, 4.4 + ZT), U(ZXB, 4.4 + ZT)],
      [U(ZXA, 4.4), U(ZXA + ZDX, 27.6 - ZT), U(ZXB, 4.4 + ZT), U(ZXB + ZDX, 27.6)],
      [U(ZXA + ZDX, 27.6 - ZT), U(28, 27.6 - ZT), U(ZXB + ZDX, 27.6), U(28, 27.6)],
    ];
    const lens = segs.map(([a0, a1, b0, b1]) => Math.hypot((a1[0] + b1[0] - a0[0] - b0[0]) / 2, (a1[1] + b1[1] - a0[1] - b0[1]) / 2));
    const total = lens.reduce((a, b) => a + b, 0);
    const counts = lens.map((l) => Math.max(4, Math.round(NS * l / total)));
    counts[2] = NS - counts[0] - counts[1];
    let row = 0;
    segs.forEach(([a0, a1, b0, b1], s) => {
      const ax = a1[0] - a0[0], ay = a1[1] - a0[1], cx = b0[0] - a0[0], cy = b0[1] - a0[1];
      zSegN[s] = (ax * cy - ay * cx) > 0 ? -1 : 1;           // N (enamel) side: toward camera on the bars
      let px = -ay, py = ax; const pl = Math.hypot(px, py); px /= pl; py /= pl;
      if (px * cx + py * cy < 0) { px = -px; py = -py; }
      zSegP[s * 2] = px; zSegP[s * 2 + 1] = py;
      for (let r = 0; r < counts[s]; r++, row++) {
        const f = r / (counts[s] - 1);
        const Ax = a0[0] + ax * f, Ay = a0[1] + ay * f, Bx = b0[0] + (b1[0] - b0[0]) * f, By = b0[1] + (b1[1] - b0[1]) * f;
        zRows[row * 4] = Ax; zRows[row * 4 + 1] = Ay; zRows[row * 4 + 2] = Bx; zRows[row * 4 + 3] = By;
        zMid[row * 2] = (Ax + Bx) / 2; zMid[row * 2 + 1] = (Ay + By) / 2;
        zTw[row] = Math.PI * s; zRowSeg[row] = s;
      }
    });
  }
  const zdata = new Float32Array(VCOUNT * 8);
  const zXf = { yaw: 0, pitch: 0, cx: 0, cy: 0, size: 1 };
  function buildZFlat() {
    const s = zXf.size * pxW, X = wx(zXf.cx), Y = wy(zXf.cy);
    const cyw = Math.cos(zXf.yaw), syw = Math.sin(zXf.yaw), cp = Math.cos(zXf.pitch), sp = Math.sin(zXf.pitch);
    for (let i = 0; i < NS; i++) {
      const q = i * 4, seg = zRowSeg[i], nzs = zSegN[seg], tpx = zSegP[seg * 2] * nzs, tpy = zSegP[seg * 2 + 1] * nzs;
      for (let j = 0; j < M; j++) {
        const f = j / (M - 1), sj = f * 2 - 1, k = (i * M + j) * 8;
        const x = zRows[q] + (zRows[q + 2] - zRows[q]) * f, y = zRows[q + 1] + (zRows[q + 3] - zRows[q + 1]) * f, z = 0.04 * (1 - sj * sj);
        let y2 = y * cp - z * sp, z2 = y * sp + z * cp;
        zdata[k] = (x * cyw + z2 * syw) * s + X; zdata[k + 1] = y2 * s + Y; zdata[k + 2] = (-x * syw + z2 * cyw) * s;
        let nx = tpx * sj * 0.26, ny = tpy * sj * 0.26, nz = nzs; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        y2 = ny * cp - nz * sp; z2 = ny * sp + nz * cp;
        zdata[k + 3] = nx * cyw + z2 * syw; zdata[k + 4] = y2; zdata[k + 5] = -nx * syw + z2 * cyw;
        zdata[k + 6] = i / (NS - 1); zdata[k + 7] = sj;
      }
    }
  }

  /* ------------------------------------------------------------------ shapes */
  const tmpA = new Float32Array(NS * 3), tmpB = new Float32Array(NS * 3);
  const twA = new Float32Array(NS), twB = new Float32Array(NS);
  const pts = new Float32Array(NS * 3), sm = new Float32Array(NS * 3), tw = new Float32Array(NS);
  let smInit = false;

  function knot(out, twist, t) { // the studio sculpture: a looping figure
    for (let i = 0; i < NS; i++) {
      const u = i / (NS - 1), a = u * TAU;
      out[i * 3] = Math.sin(a) * 1.0 + 0.1 * Math.sin(3 * a + t * 0.35);
      out[i * 3 + 1] = 0.5 * Math.sin(2 * a) + 0.1 * Math.cos(3 * a - t * 0.3);
      out[i * 3 + 2] = 0.72 * Math.cos(a) + 0.16 * Math.sin(2 * a + t * 0.5);
      twist[i] = TAU * u + 0.9 * Math.sin(2 * a + t * 0.55);
    }
  }

  const MATS = {
    orange: { e: [0.80, 0.10, 0.024], m: [0.95, 0.93, 0.9] },
    travertine: { e: [0.56, 0.37, 0.2], m: [0.98, 0.82, 0.56] },
    sage: { e: [0.23, 0.34, 0.21], m: [0.86, 0.92, 0.87] },
    indigo: { e: [0.16, 0.15, 0.72], m: [0.9, 0.9, 0.98] },
  };
  const mat = { e: MATS.orange.e.slice(), m: MATS.orange.m.slice() };

  /* ------------------------------------------------------------------ DOM hooks */
  const $ = (s) => document.querySelector(s);
  const heroTitle = $('.hero-title'), knotA = $('.knot-a'), knotB = $('.knot-b');
  const portrait = $('.portrait'), portraitImg = portrait && portrait.querySelector('img'), nameTag = portrait && portrait.querySelector('figcaption');
  const sections = [...document.querySelectorAll('main > section, .footer')];
  const hero = $('.hero'), work = $('.work'), expertise = $('.expertise'), studio = $('.studio'), contact = $('.contact');
  const studyEls = [...document.querySelectorAll('.study')];
  const stageRibbon = $('.stage-ribbon'), expAnchor = $('.exp-anchor'), zAnchor = $('.z-anchor');
  if (!heroTitle || !knotA || !knotB || !portraitImg || !zAnchor || !expAnchor || !work || !studio || !contact) { doc.classList.add('no-gl'); return; }
  let hovered = -1;

  /* ------------------------------------------------------------------ targets */
  let W = 0, H = 0, CW = 0, CH = 0, DPR = 1, samples = 0, lowQ = false;
  let msFbo, msColor, msDepth, rsFbo, rsTex, rsDepth, halfFbo, halfTex, HW = 1, HH = 1;
  // phones: DPR 1.5, 2x MSAA, lighter mesh; the governor steps down sooner
  const MAXDPR = coarse ? 1.5 : 2;
  const LOWDPR = coarse ? 1 : 1.25;
  const SLOW_FRAME = coarse ? 0.019 : 0.026;
  const colorTex = (w, h, levels, filter) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  function allocTargets() {
    [msFbo, rsFbo, halfFbo].forEach((f) => f && gl.deleteFramebuffer(f));
    [msColor, msDepth, rsDepth].forEach((r) => r && gl.deleteRenderbuffer(r));
    [rsTex, halfTex].forEach((t) => t && gl.deleteTexture(t));
    msFbo = msColor = msDepth = rsDepth = null;
    samples = lowQ ? 0 : Math.min(coarse ? 2 : 4, gl.getParameter(gl.MAX_SAMPLES));
    rsTex = colorTex(W, H, 1, gl.LINEAR);
    rsFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, rsFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rsTex, 0);
    HW = Math.max(1, W >> 1); HH = Math.max(1, H >> 1);
    halfTex = colorTex(HW, HH, Math.floor(Math.log2(Math.max(HW, HH))) + 1, gl.LINEAR_MIPMAP_LINEAR);
    halfFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, halfFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, halfTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rsFbo);
    if (samples > 0) {
      msFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
      msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
      msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, msDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    } else {
      rsDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rsDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rsDepth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function resize(force) {
    const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, lowQ ? LOWDPR : MAXDPR);
    const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr));
    if (!force && w === W && h === H && cw === CW && ch === CH) return false;
    W = w; H = h; CW = cw; CH = ch; DPR = w / cw;
    canvas.width = w; canvas.height = h;
    allocTargets();
    return true;
  }

  /* ------------------------------------------------------------------ planes */
  function makeTex() {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  const textPlane = { tex: null, ready: false, pad: 0, w: 0, h: 0, canvas: document.createElement('canvas') };
  function buildText() {
    const p = textPlane;
    const host = heroTitle.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(heroTitle).fontSize);
    const pad = Math.ceil(fs * 0.32);
    const cw = Math.ceil((host.width + pad * 2) * DPR), ch = Math.ceil((host.height + pad * 2) * DPR);
    const c = p.canvas; c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    heroTitle.querySelectorAll('.ln').forEach((ln) => {
      const r = ln.getBoundingClientRect(); const cs = getComputedStyle(ln);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const ls = parseFloat(cs.letterSpacing) || 0; const text = ln.textContent;
      const m = ctx.measureText(text);
      const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      const base = (r.top - host.top) + pad + (r.height - (asc + desc)) / 2 + asc;
      let x = r.left - host.left + pad;
      if ('letterSpacing' in ctx) { ctx.letterSpacing = cs.letterSpacing; ctx.fillText(text, x, base); ctx.letterSpacing = '0px'; }
      else { for (const chr of text) { ctx.fillText(chr, x, base); x += ctx.measureText(chr).width + ls; } }
    });
    if (!p.tex) p.tex = makeTex();
    gl.bindTexture(gl.TEXTURE_2D, p.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    p.pad = pad; p.w = host.width; p.h = host.height; p.ready = true;
    heroTitle.classList.add('is-woven');
  }
  const imgPlane = { tex: null, ready: false, aspect: 1, radius: 30 };
  {
    const im = new Image(); im.decoding = 'async'; im.src = portraitImg.currentSrc || portraitImg.src;
    im.decode().then(() => {
      imgPlane.tex = makeTex(); gl.bindTexture(gl.TEXTURE_2D, imgPlane.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      imgPlane.aspect = im.naturalWidth / im.naturalHeight; imgPlane.ready = true;
      portrait.querySelector('.portrait-frame').classList.add('is-woven'); kick();
    }).catch(() => {});
  }

  /* ------------------------------------------------------------------ camera */
  const FOV = 30 * Math.PI / 180, DIST = 10, NEAR = 0.1, FAR = 60;
  const pv = new Float32Array(16);
  let pxW = 1;
  function camera() {
    const aspect = CW / CH, f = 1 / Math.tan(FOV / 2);
    pxW = 2 * DIST * Math.tan(FOV / 2) / CH;
    pv.fill(0);
    pv[0] = f / aspect; pv[5] = f; pv[10] = (FAR + NEAR) / (NEAR - FAR); pv[11] = -1;
    pv[14] = (2 * FAR * NEAR) / (NEAR - FAR) + (-DIST) * pv[10]; pv[15] = DIST;
  }
  const depthAt = (z) => { const zv = z - DIST; const ndc = (pv[10] * zv + (2 * FAR * NEAR) / (NEAR - FAR)) / -zv; return Math.min(1, Math.max(0, ndc * 0.5 + 0.5)); };
  const wx = (px) => (px - CW / 2) * pxW;
  const wy = (py) => (CH / 2 - py) * pxW;

  /* ------------------------------------------------------------------ input */
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, px: -9999, py: -9999, energy: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1;
    const dx = e.clientX - mouse.px, dy = e.clientY - mouse.py;
    if (mouse.px > -9000) mouse.energy = Math.min(1, mouse.energy + Math.hypot(dx, dy) / 600);
    mouse.px = e.clientX; mouse.py = e.clientY; kick();
  }, { passive: true });
  let lastScrollY = scrollY, scrollVel = 0;
  let flipT0 = -1;

  /* ------------------------------------------------------------------ poses */
  function rot(out, n, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < n; i++) {
      let x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
      const x1 = x * cr - y * sr, y1 = x * sr + y * cr; x = x1; y = y1;
      const y2 = y * cp - z * sp, z2 = y * sp + z * cp; y = y2; z = z2;
      const x3 = x * cy + z * sy, z3 = -x * sy + z * cy; x = x3; z = z3;
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
  }
  function place(out, cx, cy, size, zoff) {
    const s = size * pxW, X = wx(cx), Y = wy(cy);
    for (let i = 0; i < NS; i++) { out[i * 3] = out[i * 3] * s + X; out[i * 3 + 1] = out[i * 3 + 1] * s + Y; out[i * 3 + 2] = out[i * 3 + 2] * s + zoff; }
  }

  // Hero: a figure-eight whose two loops sit in the empty corners beside the type (knot-a / knot-b)
  // and whose crossing passes BEHIND the letters, so "design & code" always reads.
  function heroPose(out, twist, t) {
    const ra = knotA.getBoundingClientRect(), rb = knotB.getBoundingClientRect();
    const par = motion ? 16 : 0;
    const ax = ra.left + ra.width * 0.5 + mouse.sx * par, ay = ra.top + ra.height * 0.5 + mouse.sy * par * 0.5;
    const bx = rb.left + rb.width * 0.5 - mouse.sx * par, by = rb.top + rb.height * 0.5 - mouse.sy * par * 0.5;
    let dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx, mx = (ax + bx) / 2, my = (ay + by) / 2;
    const fit = mobile ? 0.44 : 0.5, stretch = mobile ? 0.96 : 1.08;
    const rA = Math.max(24, Math.min(ra.width, ra.height) * fit), rB = Math.max(24, Math.min(rb.width, rb.height) * fit);
    let n = 0; const K = 16;
    const push = (x, y) => { ctrl[n * 2] = x; ctrl[n * 2 + 1] = y; n++; };
    push(mx, my);
    for (let k = 0; k <= K; k++) { const th = -2.25 + 4.5 * k / K, r = rB * (1 + 0.04 * Math.sin(t * 0.7 + th * 2)); push(bx + dx * Math.cos(th) * r * stretch + px * Math.sin(th) * r, by + dy * Math.cos(th) * r * stretch + py * Math.sin(th) * r); }
    push(mx, my);
    for (let k = 0; k <= K; k++) { const th = -2.25 + 4.5 * k / K, r = rA * (1 + 0.04 * Math.sin(t * 0.6 - th * 2)); push(ax - dx * Math.cos(th) * r * stretch + px * Math.sin(th) * r, ay - dy * Math.cos(th) * r * stretch + py * Math.sin(th) * r); }
    const [sp, cnt] = chaikin(n, true, 3);
    resample(sp, cnt, true, res2);
    const dz = Math.max(rA, rB) * pxW * 0.7;
    for (let i = 0; i < NS; i++) {
      const x = res2[i * 2], y = res2[i * 2 + 1];
      const proj = Math.abs((x - mx) * dx + (y - my) * dy) / (L / 2);
      out[i * 3] = wx(x); out[i * 3 + 1] = wy(y);
      out[i * 3 + 2] = dz * (2 * sstep(0.55, 0.95, proj) - 1);
      const u = i / (NS - 1);
      twist[i] = TAU * 2 * u + 0.6 * Math.sin(TAU * u * 2 + t * 0.5);
    }
    return { width: Math.max(Math.min(rA, rB) * 0.36, 18), mat: 'orange', closed: true, light: 0, cup: 0.6, streaks: 1, push: 0, textDepth: dz * 0.5 };
  }

  // phones: the swatch never travels between slots (it would cross the copy); it folds away
  // in the old slot and unfolds in the new one
  let slotShown = null, slotScale = 1;
  function workPose(out, twist, t) {
    const el = workFocus;
    const sr = stageRibbon ? stageRibbon.getBoundingClientRect() : null;
    knot(out, twist, t * 1.3);
    if (sr && sr.width > 0) { // desktop: the sculpture on the sticky material stage
      rot(out, NS, t * 0.32 + mouse.sx * 0.3, -0.28 + mouse.sy * 0.16, 0.2);
      const size = Math.min(sr.width * 0.4, sr.height * 0.62);
      place(out, sr.left + sr.width * 0.46, sr.top + sr.height * 0.5, size, 0);
      return { width: Math.max(size * 0.22, 22), mat: el.dataset.material, closed: true, light: 0, cup: 0.6, streaks: 1, push: 1 };
    }
    if (!slotShown || !motion) { slotShown = el; slotScale = 1; }
    if (slotShown !== el) {
      slotScale -= frameDt * 7;
      if (slotScale <= 0) { slotScale = 0; slotShown = el; smInit = false; }
    } else if (slotScale < 1) slotScale = Math.min(1, slotScale + frameDt * 5);
    const slot = slotShown.querySelector('.study-slot').getBoundingClientRect();
    // spin the saddle ring about its own axis first, then hold it tilted toward the viewer:
    // seen from above it is a near-circle, so it never turns edge-on into a disc or a "V"
    rot(out, NS, t * 0.45, 0, 0);
    rot(out, NS, 0.28, -0.98 + 0.06 * Math.sin(t * 0.3), 0.18);
    const k = smoother(slotScale);
    const size = slot.width * 0.34 * k;
    place(out, slot.left + slot.width / 2, slot.top + slot.height / 2, size, 0);
    return { width: Math.max(size * 0.22, 7 * k), mat: slotShown.dataset.material, closed: true, light: 0, cup: 0.6, streaks: 1, push: 0 };
  }

  function expertisePose(out, twist, t) { // a twisting bookmark ribbon under the sticky Expertise intro
    const r = expAnchor.getBoundingClientRect();
    const hw = r.width * 0.46, amp = r.height * (mobile ? 0.2 : 0.26);
    const waves = mobile ? 0.9 : 1.25, turns = mobile ? 0.75 : 1.5;
    for (let i = 0; i < NS; i++) {
      const u = i / (NS - 1), s = u * 2 - 1;
      out[i * 3] = wx(r.left + r.width / 2 + s * hw);
      out[i * 3 + 1] = wy(r.top + r.height / 2 + amp * Math.sin(s * Math.PI * waves + t * 0.45));
      out[i * 3 + 2] = amp * pxW * 0.8 * Math.cos(s * Math.PI * waves + t * 0.45);
      twist[i] = TAU * turns * u + t * 0.5 + mouse.sx * 0.6;
    }
    return { width: Math.max(r.height * 0.2, 16), mat: 'orange', closed: false, light: 0, cup: 0.45, streaks: 1, push: 1 };
  }

  // Studio: a complete tilted ellipse around the chest. The front arc stays in the lower chest band,
  // the back arc passes behind both shoulders; the face is a depth mask, the name tag a discard mask.
  function studioPose(out, twist, t) {
    const r = portraitImg.getBoundingClientRect();
    const cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.745;
    const rx = r.width * (mobile ? 0.6 : 0.63), ry = r.height * 0.075;
    const roll = -0.07 + 0.04 * Math.sin(t * 0.3) + mouse.sx * 0.03;
    const cr = Math.cos(roll), sr = Math.sin(roll), rz = rx * pxW * 0.7;
    for (let i = 0; i < NS; i++) {
      const u = i / (NS - 1), a = u * TAU;
      const lx = Math.cos(a) * rx, ly = Math.sin(a) * ry * (1 + 0.08 * Math.sin(t * 0.4));
      out[i * 3] = wx(cx + lx * cr - ly * sr);
      out[i * 3 + 1] = wy(cy + lx * sr + ly * cr);
      out[i * 3 + 2] = Math.sin(a) * rz;
      twist[i] = 0.32 * Math.sin(2 * a + t * 0.5);
    }
    return { width: Math.max(r.width * 0.07, 14), mat: 'orange', closed: true, light: 1, cup: 0.5, streaks: 1, push: 0 };
  }

  function zPose(out, twist, t) {
    const r = zAnchor.getBoundingClientRect();
    let flip = 0;
    if (flipT0 >= 0) { const k = (performance.now() - flipT0) / 1800; if (k >= 1) flipT0 = -1; else flip = TAU * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); }
    zXf.yaw = 0.22 * Math.sin(t * 0.3) + mouse.sx * 0.32 + flip;
    zXf.pitch = 0.07 * Math.sin(t * 0.23) + mouse.sy * 0.14;
    zXf.size = r.height * 0.4; zXf.cx = r.left + r.width / 2; zXf.cy = r.top + r.height / 2;
    for (let i = 0; i < NS; i++) { out[i * 3] = zMid[i * 2]; out[i * 3 + 1] = zMid[i * 2 + 1]; out[i * 3 + 2] = 0; twist[i] = zTw[i]; }
    rot(out, NS, zXf.yaw, zXf.pitch, 0);
    place(out, zXf.cx, zXf.cy, zXf.size, 0);
    return { width: zXf.size * ZT / 12, mat: 'orange', closed: false, light: 0, cup: 0.2, streaks: 0.25, push: 0 };
  }

  // Each pose owns an anchor. A morph runs while the previous anchor leaves and the next arrives:
  // centred in the gap when both are off-screen (so broken in-between shapes are never seen),
  // or straddling the moment the next anchor enters when they overlap. The ring must be
  // complete before the portrait appears (strict), so it never sweeps across Zvi's face.
  const heroType = $('.hero-type'), studiesList = $('.studies');
  const STATES = [
    { pose: heroPose, anchor: () => heroType },
    { pose: workPose, anchor: () => (stageRibbon && stageRibbon.getBoundingClientRect().width > 0 ? stageRibbon : studiesList) },
    { pose: expertisePose, anchor: () => expAnchor },
    { pose: studioPose, anchor: () => portrait, strict: true },
    { pose: zPose, anchor: () => zAnchor },
  ];

  let workFocus = studyEls[0];
  // Returns [from, to, k, fold]. `fold` (phones, tablets, stacked layouts) means the morph must not
  // interpolate through the viewport: `from` folds into its anchor over the first half of k,
  // `to` unfolds from its own anchor over the second half.
  function stateBlend() {
    const Wm = CH * 0.5;
    const fold = coarse || CW <= 900;
    let prev = STATES[0].anchor().getBoundingClientRect();
    for (let i = 1; i < STATES.length; i++) {
      const next = STATES[i].anchor().getBoundingClientRect();
      const u = -prev.bottom;                          // px scrolled past the previous anchor's exit
      const gap = (next.top - CH) - prev.bottom;       // exit-to-entry distance (negative = overlap)
      let u0, u1;
      if (fold) {
        // the outgoing pose stays whole until its anchor is almost gone (last 20% of the screen), then folds;
        // the next unfolds right after. A roomy gap keeps the whole fold off-screen, centred in it.
        const Wf = CH * 0.4;
        if (gap >= Wf) { u0 = gap / 2 - Wf / 2; u1 = gap / 2 + Wf / 2; } else { u0 = -Wf / 2; u1 = Wf / 2; }
      } else if (gap >= Wm) { u0 = gap / 2 - Wm / 2; u1 = gap / 2 + Wm / 2; }
      else if (STATES[i].strict) { u1 = gap; u0 = gap - Wm; }
      else { u0 = gap - Wm * 0.5; u1 = gap + Wm * 0.5; }
      if (u < u0) return [i - 1, i - 1, 0, fold];
      if (u < u1) return [i - 1, i, smoother((u - u0) / (u1 - u0)), fold];
      prev = next;
    }
    return [STATES.length - 1, STATES.length - 1, 0, fold];
  }

  /* ------------------------------------------------------------------ geometry build */
  function buildMesh(widthPx, closed, alpha) {
    const hw = widthPx * pxW * 0.5, R = hw / Math.sin(alpha);
    let pbx = 1, pby = 0, pbz = 0;
    for (let i = 0; i < NS; i++) {
      let i0 = i - 1, i1 = i + 1;
      if (closed) { if (i0 < 0) i0 = NS - 2; if (i1 > NS - 1) i1 = 1; } else { i0 = Math.max(0, i0); i1 = Math.min(NS - 1, i1); }
      const px = sm[i * 3], py = sm[i * 3 + 1], pz = sm[i * 3 + 2];
      let tx = sm[i1 * 3] - sm[i0 * 3], ty = sm[i1 * 3 + 1] - sm[i0 * 3 + 1], tz = sm[i1 * 3 + 2] - sm[i0 * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let vx = -px, vy = -py, vz = DIST - pz; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
      let bx = ty * vz - tz * vy, by = tz * vx - tx * vz, bz = tx * vy - ty * vx;
      let bl = Math.hypot(bx, by, bz);
      if (bl < 1e-4) { bx = pbx; by = pby; bz = pbz; bl = 1; }
      bx /= bl; by /= bl; bz /= bl; pbx = bx; pby = by; pbz = bz;
      const nx = by * tz - bz * ty, ny = bz * tx - bx * tz, nz = bx * ty - by * tx;
      const th = tw[i], c = Math.cos(th), s = Math.sin(th);
      const Bx = bx * c + nx * s, By = by * c + ny * s, Bz = bz * c + nz * s;
      const Nx = nx * c - bx * s, Ny = ny * c - by * s, Nz = nz * c - bz * s;
      const u = i / (NS - 1);
      for (let j = 0; j < M; j++) {
        const sj = -1 + 2 * j / (M - 1), a = sj * alpha, sa = Math.sin(a), ca = Math.cos(a);
        const k = (i * M + j) * 8;
        vdata[k] = px + Bx * R * sa + Nx * R * (ca - 1);
        vdata[k + 1] = py + By * R * sa + Ny * R * (ca - 1);
        vdata[k + 2] = pz + Bz * R * sa + Nz * R * (ca - 1);
        vdata[k + 3] = Nx * ca + Bx * sa; vdata[k + 4] = Ny * ca + By * sa; vdata[k + 5] = Nz * ca + Bz * sa;
        vdata[k + 6] = u; vdata[k + 7] = sj;
      }
    }
  }

  /* ------------------------------------------------------------------ frame */
  const bounds = new Float32Array(16);
  let time = 0, last = performance.now(), lastDraw = 0, raf = 0, frameDt = 0, foldPose = -1;
  let perfSum = 0, perfN = 0, slowStreak = 0, warm = 0;
  const glow = [0, 0, 400];
  let textDirty = true, textTimer = 0;
  const lerp = (a, b, k) => a + (b - a) * k;

  function render(dt) {
    if (resize(false)) textDirty = true;
    camera();
    if (textDirty) { textDirty = false; buildText(); }
    else if (textPlane.ready) {
      const r = heroTitle.getBoundingClientRect();
      if (Math.abs(r.width - textPlane.w) > 1 || Math.abs(r.height - textPlane.h) > 1) { clearTimeout(textTimer); textTimer = setTimeout(() => { textDirty = true; kick(); }, 120); }
    }

    const snap = !motion;
    const ease = snap ? 1 : 1 - Math.exp(-dt * 6);
    mouse.sx += (mouse.x - mouse.sx) * (snap ? 0 : ease * 0.6);
    mouse.sy += (mouse.y - mouse.sy) * (snap ? 0 : ease * 0.6);
    mouse.energy *= Math.exp(-dt * 1.6);
    const sy = scrollY; const dScroll = sy - lastScrollY; lastScrollY = sy;
    const v = dt > 0 ? dScroll / dt : 0;
    scrollVel += (v - scrollVel) * Math.min(1, dt * 8);
    if (Math.abs(dScroll) > CH * 2) scrollVel = 0; // scroll restore after a popup, not a real fling

    frameDt = dt;
    // only studies left visible by the work filter take part
    if (hovered >= 0 && !studyEls[hovered].hidden) workFocus = studyEls[hovered]; else {
      let bd = 1e9;
      studyEls.forEach((el) => { if (el.hidden) return; const r = el.querySelector('.study-media').getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - CH / 2); if (d < bd) { bd = d; workFocus = el; } });
    }

    let [ia, ib, k, fold] = stateBlend();
    let foldScale = 1;
    if (fold && ib !== ia && k > 0) {
      if (k < 0.5) { foldScale = 1 - smoother(k * 2); ib = ia; }
      else { foldScale = smoother((k - 0.5) * 2); ia = ib; }
      k = 0;
    }
    if (fold && ia !== foldPose) { if (foldPose >= 0) smInit = false; foldPose = ia; } // swap poses while folded flat: no slide
    if (!fold) foldPose = -1;
    const ra = STATES[ia].pose(tmpA, twA, time);
    let widthPx = ra.width, closed = ra.closed, light = ra.light, matKey = ra.mat, cup = ra.cup, streaks = ra.streaks, pushK = ra.push;
    let textDepth = ia === 0 && k === 0 ? ra.textDepth * foldScale + (1 - foldScale) * 1e-3 : 1e3;
    if (ib !== ia && k > 0) {
      const rb = STATES[ib].pose(tmpB, twB, time);
      for (let i = 0; i < NS * 3; i++) pts[i] = tmpA[i] + (tmpB[i] - tmpA[i]) * k;
      for (let i = 0; i < NS; i++) tw[i] = twA[i] + (twB[i] - twA[i]) * k;
      widthPx = lerp(ra.width, rb.width, k); light = lerp(ra.light, rb.light, k);
      cup = lerp(ra.cup, rb.cup, k); streaks = lerp(ra.streaks, rb.streaks, k); pushK = lerp(ra.push, rb.push, k);
      closed = k < 0.5 ? ra.closed : rb.closed;
      if (k > 0.5) matKey = rb.mat;
    } else { pts.set(tmpA); tw.set(twA); }

    // The ribbon rides with the page (no scroll lag, so it never slides over text), and eases
    // only between pose changes. Cursor pushes the nearest part toward the viewer.
    const shift = dScroll * pxW;
    const lag = snap || !smInit ? 1 : 1 - Math.exp(-dt * 10);
    for (let i = 0; i < NS; i++) {
      const o = i * 3;
      sm[o + 1] += shift;
      sm[o] += (pts[o] - sm[o]) * lag; sm[o + 1] += (pts[o + 1] - sm[o + 1]) * lag; sm[o + 2] += (pts[o + 2] - sm[o + 2]) * lag;
    }
    smInit = true;
    const push = (0.35 + mouse.energy * 1.4) * pushK * (snap || coarse ? 0 : 1);
    if (push > 0.001) {
      const mxw = wx(mouse.px), myw = wy(mouse.py), rr = Math.pow(170 * pxW, 2);
      for (let i = 0; i < NS; i++) {
        const o = i * 3, dx = sm[o] - mxw, dy = sm[o + 1] - myw;
        sm[o + 2] += Math.exp(-(dx * dx + dy * dy) / rr) * push * 0.55 * dt * 6;
      }
    }
    const velTwist = Math.max(-1.2, Math.min(1.2, scrollVel * 0.0012));
    if (!snap) for (let i = 0; i < NS; i++) tw[i] += velTwist * Math.sin(i / (NS - 1) * TAU * 3 + time * 2);

    buildMesh(widthPx, closed, cup);
    // the Z is a flat-folded strip: blend the ribbon mesh into it as the fold completes
    let zW = 0;
    if (ib === ia) zW = STATES[ia].pose === zPose ? 1 : 0;
    else if (STATES[ib].pose === zPose) zW = smoother((k - 0.35) / 0.65);
    if (zW > 0) {
      buildZFlat();
      if (zW >= 1) vdata.set(zdata);
      else for (let v = 0; v < VCOUNT * 8; v += 8) {
        for (let c = 0; c < 6; c++) vdata[v + c] += (zdata[v + c] - vdata[v + c]) * zW;
      }
    }
    // fold: shrink the finished mesh (width included) into its own centre
    const drawRibbon = foldScale > 0.002;
    if (foldScale < 1 && drawRibbon) {
      let fx = 0, fy = 0, fz = 0, fn = 0;
      for (let v = 0; v < VCOUNT * 8; v += 8 * M) { fx += vdata[v]; fy += vdata[v + 1]; fz += vdata[v + 2]; fn++; }
      fx /= fn; fy /= fn; fz /= fn;
      for (let v = 0; v < VCOUNT * 8; v += 8) {
        vdata[v] = fx + (vdata[v] - fx) * foldScale; vdata[v + 1] = fy + (vdata[v + 1] - fy) * foldScale; vdata[v + 2] = fz + (vdata[v + 2] - fz) * foldScale;
      }
    }

    const target = MATS[matKey] || MATS.orange; const me = snap ? 1 : 1 - Math.exp(-dt * 3.5);
    for (let c = 0; c < 3; c++) { mat.e[c] += (target.e[c] - mat.e[c]) * me; mat.m[c] += (target.m[c] - mat.m[c]) * me; }

    bounds.fill(0);
    let topTheme = 0, n = 0, prev = null;
    sections.forEach((s, i) => {
      const th = s.dataset.theme === 'light' ? 1 : 0;
      if (i === 0) { topTheme = th; prev = th; return; }
      if (th !== prev && n < 4) { const r = s.getBoundingClientRect(); bounds[n * 4] = r.top; bounds[n * 4 + 1] = th; bounds[n * 4 + 2] = 1; n++; }
      prev = th;
    });

    let gx = 0, gy = 0; for (let i = 0; i < NS; i += 8) { gx += sm[i * 3]; gy += sm[i * 3 + 1]; }
    const cnt = Math.ceil(NS / 8); gx /= cnt; gy /= cnt;
    glow[0] = (gx / pxW + CW / 2) * DPR; glow[1] = (CH / 2 - gy / pxW) * DPR; glow[2] = Math.min(CW, CH) * 0.55 * DPR;

    /* ---- draw ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, samples > 0 ? msFbo : rsFbo);
    gl.viewport(0, 0, W, H);
    gl.depthMask(true); gl.clearColor(0, 0, 0, 0.5); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);

    gl.useProgram(P.bg.p); gl.bindVertexArray(emptyVao);
    gl.uniform2f(P.bg.u.uRes, W, H); gl.uniform1f(P.bg.u.uDpr, DPR); gl.uniform1f(P.bg.u.uTime, time);
    gl.uniform4fv(P.bg.u.uB, bounds); gl.uniform1f(P.bg.u.uTopTheme, topTheme);
    gl.uniform3f(P.bg.u.uGlow, glow[0], glow[1], glow[2]); gl.uniform1f(P.bg.u.uAmp, mobile ? 14 : 30);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const mr = nameTag.getBoundingClientRect();
    const maskOn = mr.bottom > -50 && mr.top < CH + 50;
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.useProgram(P.rib.p); gl.bindVertexArray(ribVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, vdata);
    gl.uniformMatrix4fv(P.rib.u.uPV, false, pv);
    gl.uniform3f(P.rib.u.uCam, 0, 0, DIST);
    gl.uniform3fv(P.rib.u.uEnamel, mat.e); gl.uniform3fv(P.rib.u.uMetal, mat.m);
    gl.uniform1f(P.rib.u.uLight, light); gl.uniform1f(P.rib.u.uStreaks, streaks);
    gl.uniform1f(P.rib.u.uResY, H);
    if (maskOn) gl.uniform4f(P.rib.u.uMask, (mr.left - 18) * DPR, (mr.top - 14) * DPR, (mr.right + 18) * DPR, (mr.bottom + 14) * DPR);
    else gl.uniform4f(P.rib.u.uMask, 0, 0, 0, 0);
    gl.uniform2f(P.rib.u.uRot, mouse.sx * 0.9 + Math.sin(time * 0.1) * 0.3, mouse.sy * 0.35);
    if (drawRibbon) gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

    // DOM planes
    gl.depthMask(false); gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.plane.p); gl.bindVertexArray(quadVao);
    gl.uniformMatrix4fv(P.plane.u.uPV, false, pv); gl.uniform1f(P.plane.u.uDpr, DPR);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(P.plane.u.uTex, 0);
    if (textPlane.ready) {
      const r = heroTitle.getBoundingClientRect();
      if (r.bottom > -200 && r.top < CH + 200) {
        const p = textPlane.pad, x = r.left - p, y = r.top - p, w = textPlane.w + p * 2, h = textPlane.h + p * 2;
        gl.bindTexture(gl.TEXTURE_2D, textPlane.tex);
        gl.uniform1i(P.plane.u.uKind, 0); gl.uniform3f(P.plane.u.uColor, 0.937, 0.91, 0.87);
        gl.uniform1f(P.plane.u.uDepth, depthAt(textDepth));
        gl.uniform4f(P.plane.u.uRect, wx(x), wy(y), w * pxW, h * pxW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    if (imgPlane.ready) {
      const r = portraitImg.getBoundingClientRect();
      if (r.bottom > -200 && r.top < CH + 200) {
        gl.bindTexture(gl.TEXTURE_2D, imgPlane.tex);
        gl.uniform1i(P.plane.u.uKind, 1); gl.uniform2f(P.plane.u.uSize, r.width, r.height);
        gl.uniform1f(P.plane.u.uRadius, imgPlane.radius); gl.uniform1f(P.plane.u.uImgAspect, imgPlane.aspect);
        gl.uniform4f(P.plane.u.uFace, 0.585, 0.275, 0.25, 0.25); // Zvi's head incl. sunglasses, in image uv
        gl.uniform4f(P.plane.u.uRect, wx(r.left), wy(r.top), r.width * pxW, r.height * pxW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    if (samples > 0) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rsFbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rsFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, halfFbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, HW, HH, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, halfTex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rsTex);

    const lightCentre = lightAt(CH * 0.5);
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.post.p); gl.bindVertexArray(emptyVao);
    gl.uniform1i(P.post.u.uScene, 0); gl.uniform1i(P.post.u.uHalf, 1); gl.uniform2f(P.post.u.uRes, W, H); gl.uniform1f(P.post.u.uTime, time);
    gl.uniform1f(P.post.u.uAberr, snap ? 0 : Math.min(0.012, Math.max(0, Math.abs(scrollVel) - 600) * 0.000008));
    gl.uniform1f(P.post.u.uGrain, 0.04);
    gl.uniform1f(P.post.u.uVig, 0.42);
    gl.uniform1f(P.post.u.uBloom, 0.9 - 0.5 * lightCentre);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!api.live) { api.live = true; doc.classList.add('gl-live'); }
  }
  function lightAt(y) {
    for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= y && r.bottom > y) return s.dataset.theme === 'light' ? 1 : 0; }
    return 0;
  }

  /* ------------------------------------------------------------------ loop control */
  let paused = doc.classList.contains('is-locked'), onScreen = true, dead = false;
  const canRun = () => !!P && !dead && !paused && onScreen && !document.hidden;
  function frame(now) {
    raf = 0;
    if (!canRun()) return;
    if (lowQ && motion && now - lastDraw < 31) { raf = requestAnimationFrame(frame); return; }
    const raw = Math.max(0, (now - last) / 1000); last = now; lastDraw = now;
    const dt = Math.min(0.05, raw);
    if (motion) time += dt;
    try { render(dt); } catch (e) { console.warn(e); doc.classList.remove('gl-live'); doc.classList.add('no-gl'); return; }
    // quality governor: a sustained frame time above ~26ms (19ms on phones) drops MSAA, caps DPR and runs at 30fps
    if (motion && !lowQ && raw < 0.25) {
      if (warm < 90) warm++;
      else {
        perfSum += raw; perfN++;
        if (perfSum > 1) {
          if (perfSum / perfN > SLOW_FRAME) { if (++slowStreak >= 2) { lowQ = true; resize(true); textDirty = true; } } else slowStreak = 0;
          perfSum = 0; perfN = 0;
        }
      }
    }
    if (motion) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && canRun()) { last = Math.max(last, performance.now() - 50); raf = requestAnimationFrame(frame); } }
  api.hover = (i) => { hovered = i; kick(); };
  api.setMotion = (on) => { motion = !!on; last = performance.now(); kick(); };
  api.setPaused = (p) => { paused = !!p; if (!paused) { last = performance.now(); lastScrollY = scrollY; kick(); } };
  api.flip = () => { if (motion) { flipT0 = performance.now(); kick(); } };

  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target); });
      const was = onScreen; onScreen = visible.size > 0;
      if (onScreen && !was) { last = performance.now(); kick(); }
    }, { rootMargin: '80px 0px' });
    document.querySelectorAll('[data-gl]').forEach((el) => io.observe(el));
  }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { textDirty = true; kick(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); kick(); } });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; doc.classList.remove('gl-live'); doc.classList.add('no-gl'); });
  // iOS backgrounding / GPU memory pressure: once the GPU is back, this instance stays retired and a fresh
  // canvas + fresh stage take over (site.js always reads window.ZStage, so it follows automatically)
  canvas.addEventListener('webglcontextrestored', () => {
    if (!SRC || !canvas.isConnected) return;
    const fresh = canvas.cloneNode(false); canvas.replaceWith(fresh);
    doc.classList.remove('no-gl');
    const s = document.createElement('script'); s.src = SRC; document.head.appendChild(s);
  });

  /* Boot after the page has painted and gone idle: FCP and LCP land first (the DOM hero shows
     as-is), then the GL work arrives in small tasks and the woven stage takes over seamlessly. */
  const start = () => { textDirty = true; kick(); };
  const whenLoaded = () => new Promise((r) => { if (document.readyState === 'complete') r(); else addEventListener('load', () => r(), { once: true }); });
  const whenIdle = () => new Promise((r) => { if ('requestIdleCallback' in window) requestIdleCallback(() => r(), { timeout: 2000 }); else setTimeout(r, 250); });
  (async () => {
    await whenLoaded();
    // after the first paint — but never stall in a background tab, where rAF does not fire
    await new Promise((r) => { const t = setTimeout(r, 600); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); });
    await whenIdle();
    try { P = await buildPrograms(); } catch (e) { doc.classList.add('no-gl'); return; }
    if (dead) return;
    motion = !doc.classList.contains('motion-off');
    paused = doc.classList.contains('is-locked');
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('700 200px "Space Grotesk"'), document.fonts.ready]).then(start, start);
    } else start();
  })();
})();
