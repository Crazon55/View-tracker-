import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** Soft monochrome smoke + film grain — matches reference fluid bg. */
const FRAG = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.05 + 17.3;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float t = u_time * 1.05;

  vec2 drift = vec2(t * 0.052, t * 0.036);
  vec2 warp = vec2(sin(p.y * 1.15 + t * 0.062) * 0.11, cos(p.x * 0.9 - t * 0.052) * 0.085);
  vec2 q = p * 1.12 + warp + drift;

  float n1 = fbm(q * 1.05 + vec2(t * 0.066, -t * 0.046));
  float n2 = fbm(q * 1.85 - vec2(t * 0.058, t * 0.068) + 4.7);
  float n3 = fbm(q * 0.62 + vec2(t * 0.042, -t * 0.03));
  float mist = mix(n1, n2, 0.52);
  mist = mix(mist, n3, 0.32);

  /* Soft ambient lift through noise — avoids directional banding from sweep gradients */
  mist += fbm(q * 0.38 + vec2(t * 0.018, -t * 0.014)) * 0.07;

  float lum = mist;
  lum = lum * lum * (3.0 - 2.0 * lum);
  lum = pow(lum, 1.12);

  float vig = 1.0 - dot(p * 0.42, p * 0.42);
  lum *= smoothstep(0.02, 0.9, vig);

  float grain = hash(gl_FragCoord.xy * 0.85) * 0.04 - 0.02;
  float dither = (hash(gl_FragCoord.xy * 1.73 + 0.37) - 0.5) / 255.0;
  lum = clamp(lum * 0.62 + grain + dither, 0.0, 1.0);

  gl_FragColor = vec4(vec3(lum), 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function fbm2(x: number, y: number) {
  let v = 0;
  let a = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 4; i++) {
    v += a * noise2(px, py);
    const nx = px * 1.9 + 17.3;
    const ny = py * 1.9 + 17.3;
    px = nx * 0.8 - ny * 0.6;
    py = nx * 0.6 + ny * 0.8;
    a *= 0.5;
  }
  return v;
}

function sampleMist(x: number, y: number, t: number, w: number, h: number) {
  const ts = t * 1.05;
  let px = (x / w) * 2 - 1;
  let py = (y / h) * 2 - 1;
  px *= w / h;

  const driftX = ts * 0.052;
  const driftY = ts * 0.036;
  const warpX = Math.sin(py * 1.15 + ts * 0.062) * 0.11;
  const warpY = Math.cos(px * 0.9 - ts * 0.052) * 0.085;
  const qx = px * 1.12 + warpX + driftX;
  const qy = py * 1.12 + warpY + driftY;

  const n1 = fbm2(qx * 1.05 + ts * 0.066, qy - ts * 0.046);
  const n2 = fbm2(qx * 1.85 - ts * 0.058, qy + ts * 0.068 + 4.7);
  const n3 = fbm2(qx * 0.62 + ts * 0.042, qy - ts * 0.03);
  let mist = n1 * 0.48 + n2 * 0.34 + n3 * 0.18;
  mist += fbm2(qx * 0.38 + ts * 0.018, qy - ts * 0.014) * 0.07;

  let lum = mist;
  lum = lum * lum * (3 - 2 * lum);
  lum = Math.pow(lum, 1.12);
  const vig = 1 - (px * 0.42) ** 2 - (py * 0.42) ** 2;
  lum *= Math.max(0, Math.min(1, (vig - 0.02) / 0.88));
  const grain = hash2(x * 0.85, y * 0.85) * 0.04 - 0.02;
  const dither = (hash2(x * 1.73 + 0.37, y * 1.73 + 0.37) - 0.5) / 255;
  return Math.max(0, Math.min(1, lum * 0.62 + grain + dither));
}

/** 2D fallback — same smoke look at half resolution. */
function startCanvas2dFallback(canvas: HTMLCanvasElement, reducedMotion: boolean) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return () => {};

  let raf = 0;
  let running = true;
  let w = 0;
  let h = 0;
  let start = performance.now();
  const scale = 0.45;

  const resize = () => {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };

  const draw = (now: number) => {
    if (!running) return;

    const t = (now - start) * 0.001;
    const sw = Math.max(1, Math.ceil(w * scale));
    const sh = Math.max(1, Math.ceil(h * scale));
    const imageData = ctx.createImageData(sw, sh);
    const px = imageData.data;

    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const lum = Math.round(sampleMist(i / scale, j / scale, t, w, h) * 255);
        const idx = (j * sw + i) * 4;
        px[idx] = lum;
        px[idx + 1] = lum;
        px[idx + 2] = lum;
        px[idx + 3] = 255;
      }
    }

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const off = document.createElement("canvas");
    off.width = sw;
    off.height = sh;
    off.getContext("2d")!.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, sw, sh, 0, 0, w, h);

    if (!reducedMotion) raf = requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(draw);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}

function startWebGL(canvas: HTMLCanvasElement, reducedMotion: boolean) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) return null;

  const program = createProgram(gl);
  if (!program) return null;

  const posLoc = gl.getAttribLocation(program, "a_pos");
  if (posLoc < 0) return null;

  const resLoc = gl.getUniformLocation(program, "u_resolution");
  const timeLoc = gl.getUniformLocation(program, "u_time");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  let raf = 0;
  let running = true;
  let start = performance.now();

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  const draw = (now: number) => {
    if (!running) return;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, (now - start) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reducedMotion) raf = requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize);
  raf = requestAnimationFrame(draw);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  };
}

/** GPU fluid smoke + grain background with 2D fallback. */
function PatternCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanup = startWebGL(canvas, reducedMotion) ?? startCanvas2dFallback(canvas, reducedMotion);
    return cleanup;
  }, []);

  return <canvas ref={canvasRef} className="fs-pattern-canvas" aria-hidden />;
}

export function MovingBackground() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready) return null;

  return createPortal(
    <div className="fs-moving-bg" aria-hidden>
      <PatternCanvas />
    </div>,
    document.body,
  );
}
