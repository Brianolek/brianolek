/* Smear: a WebGL hero. The pointer leaves a decaying velocity field; the painting is
   streaked along that field, biased upward, the way the figures in the work smear off
   the canvas. Falls back to a plain image if WebGL is unavailable. */
(function () {
  const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

  const FIELD = `
    precision mediump float; varying vec2 v;
    uniform sampler2D u_field; uniform vec2 u_mouse, u_vel; uniform float u_aspect, u_decay, u_radius;
    void main(){
      vec2 uv = v - vec2(0.0, 0.0025);            /* the field drifts upward */
      vec2 f = texture2D(u_field, uv).xy * 2.0 - 1.0;
      f *= u_decay;
      vec2 d = v - u_mouse; d.x *= u_aspect;
      float s = exp(-dot(d,d) * u_radius);
      f += u_vel * s;
      f = clamp(f, -1.0, 1.0);
      gl_FragColor = vec4(f * 0.5 + 0.5, 0.0, 1.0);
    }`;

  const DRAW = `
    precision mediump float; varying vec2 v;
    uniform sampler2D u_img, u_field; uniform vec2 u_res, u_imgRes; uniform float u_strength, u_fade, u_time;
    vec2 cover(vec2 uv){
      float ra = u_res.x/u_res.y, ia = u_imgRes.x/u_imgRes.y;
      if (ra > ia) uv.y = (uv.y - 0.5) * (ia/ra) + 0.5; else uv.x = (uv.x - 0.5) * (ra/ia) + 0.5;
      return uv;
    }
    void main(){
      vec2 f = texture2D(u_field, v).xy * 2.0 - 1.0;
      float amt = length(f);
      vec2 dir = amt > 0.002 ? normalize(f + vec2(0.0, 0.6 * amt)) : vec2(0.0, 1.0);
      dir.x *= u_res.y / u_res.x;
      float len = amt * u_strength;
      vec2 base = cover(v);
      vec3 col = vec3(0.0); float wsum = 0.0;
      const int N = 24;
      for (int i = 0; i < N; i++) {
        float t = float(i) / float(N - 1);
        float w = 1.0 - t * 0.6;
        vec2 o = dir * len * t;
        vec2 uv = cover(v - o);
        col.r += texture2D(u_img, uv - o * 0.12).r * w;
        col.g += texture2D(u_img, uv).g * w;
        col.b += texture2D(u_img, uv + o * 0.12).b * w;
        wsum += w;
      }
      col /= wsum;
      /* faint darkening where the smear is strongest, like paint pulled thin */
      col *= 1.0 - amt * 0.25;
      /* vignette */
      vec2 q = v - 0.5; col *= 1.0 - dot(q,q) * 0.7;
      gl_FragColor = vec4(col * u_fade, 1.0);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function fieldTex(gl, size) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const px = new Uint8Array(size * size * 4).fill(128);
    for (let i = 3; i < px.length; i += 4) px[i] = 255;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, fb };
  }

  window.Smear = function (canvas, imgSrc, opts) {
    opts = Object.assign({ strength: 0.5, decay: 0.965, radius: 60, idle: true }, opts || {});
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) { canvas.style.background = `#000 url(${imgSrc}) center/cover no-repeat`; return null; }

    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pField = program(gl, FIELD), pDraw = program(gl, DRAW);
    for (const p of [pField, pDraw]) { const a = gl.getAttribLocation(p, "p"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
    const U = (p, n) => gl.getUniformLocation(p, n);

    const FS = 256;
    let A = fieldTex(gl, FS), B = fieldTex(gl, FS);
    const img = new Image(); img.crossOrigin = "anonymous";
    const tex = gl.createTexture();
    let ready = false, imgW = 1, imgH = 1, fade = 0;
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      imgW = img.naturalWidth; imgH = img.naturalHeight; ready = true;
    };
    img.src = imgSrc;

    let W = 1, H = 1, dpr = 1;
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    }
    resize(); addEventListener("resize", resize);

    /* pointer state in canvas uv (0..1, y up) */
    const m = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, vx: 0, vy: 0, last: 0, active: false };
    function setPointer(cx, cy) {
      const r = canvas.getBoundingClientRect();
      m.x = (cx - r.left) / r.width; m.y = 1 - (cy - r.top) / r.height;
      m.last = performance.now(); m.active = true;
    }
    canvas.addEventListener("pointermove", e => setPointer(e.clientX, e.clientY), { passive: true });
    canvas.addEventListener("pointerdown", e => setPointer(e.clientX, e.clientY), { passive: true });
    canvas.addEventListener("pointerleave", () => { m.active = false; });
    canvas.addEventListener("touchmove", e => { const t = e.touches[0]; if (t) setPointer(t.clientX, t.clientY); }, { passive: true });

    let visible = true;
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(canvas);

    let t0 = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible) return;
      const t = (now - t0) / 1000;
      /* idle drift: when nobody is touching it, a slow wander keeps the paint moving */
      if (opts.idle && !reduced && now - m.last > 2500) {
        m.x = 0.5 + 0.28 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 1.3);
        m.y = 0.55 + 0.18 * Math.cos(t * 0.29) + 0.06 * Math.cos(t * 0.9);
        m.active = true;
      }
      let vx = (m.x - m.px), vy = (m.y - m.py);
      m.px = m.x; m.py = m.y;
      if (!m.active || reduced) { vx = 0; vy = 0; }
      /* smooth + clamp the impulse */
      m.vx += (vx * 6 - m.vx) * 0.5; m.vy += (vy * 6 - m.vy) * 0.5;
      const mag = Math.hypot(m.vx, m.vy), cap = 0.9;
      const sx = mag > cap ? m.vx / mag * cap : m.vx, sy = mag > cap ? m.vy / mag * cap : m.vy;

      /* 1. advance the field: read A, write B */
      gl.viewport(0, 0, FS, FS);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb);
      gl.useProgram(pField);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, A.t);
      gl.uniform1i(U(pField, "u_field"), 0);
      gl.uniform2f(U(pField, "u_mouse"), m.x, m.y);
      gl.uniform2f(U(pField, "u_vel"), sx * 0.35, sy * 0.35);
      gl.uniform1f(U(pField, "u_aspect"), W / H);
      gl.uniform1f(U(pField, "u_decay"), opts.decay);
      gl.uniform1f(U(pField, "u_radius"), opts.radius);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      [A, B] = [B, A];

      /* 2. draw the painting through the field */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(pDraw);
      if (ready) fade = Math.min(1, fade + 0.02);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U(pDraw, "u_img"), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, A.t); gl.uniform1i(U(pDraw, "u_field"), 1);
      gl.uniform2f(U(pDraw, "u_res"), W, H);
      gl.uniform2f(U(pDraw, "u_imgRes"), imgW, imgH);
      gl.uniform1f(U(pDraw, "u_strength"), opts.strength);
      gl.uniform1f(U(pDraw, "u_fade"), fade);
      gl.uniform1f(U(pDraw, "u_time"), t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(frame);
    return { setImage(src) { ready = false; fade = 0; img.src = src; } };
  };
})();
