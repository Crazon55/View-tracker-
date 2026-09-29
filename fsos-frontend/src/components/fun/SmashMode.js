import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Icons from "lucide-react";
import html2canvas from "html2canvas";

/**
 * Smash mode: a stickman with a jetpack and too many weapons, loose on the page.
 *
 * How it works
 * ------------
 * When it starts, the visible page is photographed (html2canvas) and every visible
 * thing on it — cards, badges, buttons, icons, and each individual letter — becomes a
 * "paper block" cut from that photo. From then on the game is one canvas laid over the
 * page: a paper background, the blocks on top, and the pieces that come off them.
 * Everything that breaks is gone in the same frame it's drawn, and the real page
 * underneath is never touched at all.
 *
 * - Small blocks (letters, badges, buttons, icons) shatter into textured pieces.
 * - Big blocks (cards, panels) get torn holes; a hole in a card shows the panel it sat
 *   on, a hole in the panel shows the paper. Tear enough out and the rest of the block
 *   breaks up, contents and all.
 * - Explosions tear through every layer and knock nearby things loose.
 *
 * The stickman collides with a mask of the page: he stands on letters and on the tops
 * of cards, and climbs anything he walks into.
 *
 * Safety: a full-screen layer takes every pointer event and a capturing key handler
 * swallows every key (bar browser shortcuts), so nothing in the app can be clicked,
 * typed into or triggered. Nothing is written anywhere; Esc drops the canvas and the
 * page is exactly as it was.
 */

// ── tuning ──────────────────────────────────────────────────────────────────────
const GRAVITY = 1900;
const RUN = 330;
const JUMP = 640;
const THRUST = 3400;
const MAX_RISE = 560;
const FUEL = 2.4;
const CLIMB = 260;
const BODY = 60;                 // his height on screen (drawn at 1.5x)
const BULLET_SPEED = 1250;
const FIRE_EVERY = 0.11;
const RAY_TICK = 0.05;
const RPG_COOLDOWN = 0.75;
const SMALL_AREA = 3200;         // below this a block shatters in one hit
const MAX_PIECES = 650;
const MAX_LETTERS = 8000;
const CELL = 48;

const WEAPONS = [
  ["blaster", "1 Blaster"],
  ["ray", "2 Ray gun"],
  ["rpg", "3 RPG"],
  ["hammer", "4 Hammer"],
  ["bomb", "5 Bomb"],
];

// Mask levels: what the stickman stands on and climbs. Paper is 0; big blocks are the
// wall he's in front of (1); letters and small things are solid objects (2).
const PAPER = 0, WALL = 1, THING = 2;

function parseColor(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || "");
  if (!m) return null;
  const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
  return [Number(r), Number(g), Number(b), Number(a)];
}
const isClear = (c) => !c || c[3] === 0;
const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
const css = (c) => `rgb(${c.map(Math.round).join(",")})`;

function readVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? v.split(/\s+/).map(Number) : fallback;
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

// A sheet of paper: warm base, grain, a few fibres. Drawn once.
function makePaper(W, H, dark) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = dark ? "#2a2621" : "#efe7d8";
  g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * (dark ? 10 : 14);
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.lineWidth = 1;
  for (let i = 0; i < (W * H) / 5000; i++) {
    g.strokeStyle = dark ? "rgba(255,240,220,0.05)" : "rgba(120,90,50,0.07)";
    const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI, l = 8 + Math.random() * 26;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (Math.random() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, dark ? "rgba(0,0,0,0.35)" : "rgba(90,60,20,0.12)");
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}

function roundRectPath(g, b) {
  const r = Math.min(b.radius || 0, (b.r - b.l) / 2, (b.b - b.t) / 2);
  g.beginPath();
  if (r > 0.5 && g.roundRect) g.roundRect(b.l, b.t, b.r - b.l, b.b - b.t, r);
  else g.rect(b.l, b.t, b.r - b.l, b.b - b.t);
}

function jagged(g, x, y, r, n = 22) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.72 + Math.random() * 0.38);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

// ── reading the page into blocks ───────────────────────────────────────────────
function collectBlocks(W, H, isOurs) {
  const blocks = [];
  const byEl = new Map();
  const styles = new Map();
  const clips = new Map();
  const style = (el) => { let s = styles.get(el); if (!s) { s = getComputedStyle(el); styles.set(el, s); } return s; };
  const pageColor = readVar("--canvas", [250, 248, 245]).slice(0, 3);

  const clipOf = (el) => {
    if (!el || el === document.body || el === document.documentElement) return { l: 0, t: 0, r: W, b: H };
    if (clips.has(el)) return clips.get(el);
    let c = clipOf(el.parentElement);
    const s = style(el);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") {
      const rc = el.getBoundingClientRect();
      c = { l: Math.max(c.l, rc.left), t: Math.max(c.t, rc.top), r: Math.min(c.r, rc.right), b: Math.min(c.b, rc.bottom) };
    }
    clips.set(el, c);
    return c;
  };
  const parentBlock = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) if (byEl.has(n)) return byEl.get(n);
    return null;
  };

  const vpArea = W * H;
  let z = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (isOurs(el)) continue;
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;   // an icon's parts belong to the icon
    const s = style(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") continue;
    const rc = el.getBoundingClientRect();
    if (rc.width < 1 || rc.height < 1) continue;
    const c = clipOf(el.parentElement);
    const box = { l: Math.max(rc.left, c.l, 0), t: Math.max(rc.top, c.t, 0), r: Math.min(rc.right, c.r, W), b: Math.min(rc.bottom, c.b, H) };
    if (box.r - box.l < 1 || box.b - box.t < 1) continue;
    const area = (box.r - box.l) * (box.b - box.t);
    if (area > vpArea * 0.6) continue;                                        // page-sized wrappers are the paper
    const tag = el.tagName.toLowerCase();
    const bg = parseColor(s.backgroundColor);
    const painted = tag === "svg" || ["img", "input", "textarea", "select", "button", "video", "canvas"].includes(tag)
      || !isClear(bg) || s.backgroundImage !== "none" || s.boxShadow !== "none"
      || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0
      || parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0;
    if (!painted) continue;
    const parent = parentBlock(el);
    const under = parent ? parent.color : pageColor;
    const color = !isClear(bg) ? over(bg, under) : under;
    const b = {
      kind: tag === "svg" ? "icon" : "box", el, ...box, radius: parseFloat(s.borderTopLeftRadius) || 0,
      z: z++, parent, kids: [], alive: true, color, area,
      small: area < SMALL_AREA,
    };
    if (parent) parent.kids.push(b);
    byEl.set(el, b);
    blocks.push(b);
  }

  // Letters: one block per character, on top of everything.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node, letters = 0;
  while ((node = walker.nextNode()) && letters < MAX_LETTERS) {
    const el = node.parentElement;
    if (!el || isOurs(el) || !node.textContent.trim()) continue;
    const s = style(el);
    if (s.visibility === "hidden" || s.opacity === "0" || s.display === "none") continue;
    range.selectNodeContents(node);
    const nb = range.getBoundingClientRect();
    if (nb.width < 1 || nb.bottom < 0 || nb.top > H || nb.right < 0 || nb.left > W) continue;
    const c = clipOf(el);
    const parent = byEl.get(el) || parentBlock(el);
    const text = node.textContent;
    for (let i = 0; i < text.length && letters < MAX_LETTERS; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const rc = range.getClientRects()[0];
      if (!rc) continue;
      const box = { l: Math.max(rc.left, c.l), t: Math.max(rc.top, c.t), r: Math.min(rc.right, c.r), b: Math.min(rc.bottom, c.b) };
      if (box.r - box.l < 1 || box.b - box.t < 1) continue;
      const b = { kind: "letter", el, ...box, radius: 0, z: 1e6 + letters, parent, kids: [], alive: true, color: null, area: (box.r - box.l) * (box.b - box.t), small: true };
      if (parent) parent.kids.push(b);
      blocks.push(b);
      letters += 1;
    }
  }
  return blocks;
}

export default function SmashMode({ onExit }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const [smashed, setSmashed] = useState(0);
  const [weapon, setWeapon] = useState("blaster");
  const [phase, setPhase] = useState("loading");

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const SP = Math.min(dpr, 2);                   // resolution of the page photo
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    let alive = true;
    let game = null;

    // Nothing typed during the game should land in a field that had focus.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

    // Input is swallowed from the first moment, including while the page is being read.
    const keys = new Set();
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;           // leave browser shortcuts alone
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") { onExit(); return; }
      keys.add(e.key.toLowerCase());
      game?.keyDown(e.key.toLowerCase(), e.repeat);
    };
    const onKeyUp = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      keys.delete(e.key.toLowerCase());
    };
    const mouse = { x: W / 2, y: H / 2, down: false };
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onDown = (e) => {
      e.preventDefault();
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (e.button === 2) { game?.hammer(); return; }
      mouse.down = true;
      game?.attack();
    };
    const onUp = () => { mouse.down = false; };
    const noMenu = (e) => e.preventDefault();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    root.addEventListener("contextmenu", noMenu);
    const onResize = () => onExit();                // the photo is of this window size
    window.addEventListener("resize", onResize);

    let raf = 0;

    (async () => {
      const isOurs = (el) => root.contains(el);
      const blocks = collectBlocks(W, H, isOurs);
      let shot;
      try {
        // foreignObjectRendering: the browser lays out and draws the copy itself, so
        // text lands exactly where it is on screen (html2canvas's own renderer puts it
        // a few pixels low, which clipped letters cut from the photo).
        shot = await html2canvas(document.body, {
          backgroundColor: null, scale: SP, logging: false, useCORS: true, foreignObjectRendering: true,
          x: window.scrollX, y: window.scrollY, width: W, height: H,
          windowWidth: document.documentElement.clientWidth, windowHeight: H,
          ignoreElements: (el) => el === root || el.tagName === "NOSCRIPT",
          // The browser draws this copy with scripts off, which would show the page's
          // <noscript> line and push everything down; the copy drops it.
          // No scrollbars in the copy either: the browser draws them there unstyled, where
          // they take room the live page doesn't give them. overflow:hidden drops the bar
          // and keeps the content exactly where it was.
          onclone: (doc) => {
            doc.querySelectorAll("noscript").forEach((n) => n.remove());
            const view = doc.defaultView;
            for (const el of doc.body.querySelectorAll("*")) {
              const st = view.getComputedStyle(el);
              if (/(auto|scroll)/.test(st.overflowX + st.overflowY)) el.style.setProperty("overflow", "hidden", "important");
            }
          },
        });
      } catch (err) {
        if (alive) setPhase("failed");
        return;
      }
      if (!alive) return;
      game = startGame({ ctx, W, H, dpr, SP, shot, blocks, keys, mouse, setSmashed, setWeapon });
      setPhase("ready");
      let last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        game.step(dt);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", onResize);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("contextmenu", noMenu);
    };
  }, [onExit]);

  const stop = (e) => e.stopPropagation();

  return createPortal(
    <div ref={rootRef} data-testid="smash-mode" className="fixed inset-0 z-[9999] cursor-crosshair select-none" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
      <div
        onPointerDown={stop}
        className="absolute left-1/2 top-3 -translate-x-1/2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-stone-300 bg-white/95 px-3 py-2 text-xs text-stone-700 shadow-lg cursor-default max-w-[calc(100vw-24px)]"
      >
        <span className="inline-flex items-center gap-1 font-semibold text-stone-900"><Icons.Hammer className="h-3.5 w-3.5" /> Smash mode</span>
        {phase === "loading" && <span className="text-stone-500" data-testid="smash-loading">Turning the page into paper…</span>}
        {phase === "failed" && <span className="text-rose-700">Couldn't set up on this page — press Esc.</span>}
        {phase === "ready" && (
          <>
            <span className="font-mono text-[#C0512F]" data-testid="smash-count">{smashed} smashed</span>
            <span className="flex items-center gap-1">
              {WEAPONS.map(([k, label]) => (
                <span key={k} className={`rounded px-1.5 py-0.5 border ${weapon === k ? "border-stone-800 bg-stone-900 text-stone-50" : "border-stone-200"}`}>{label}</span>
              ))}
            </span>
            <span className="text-stone-500 hidden md:inline">A/D move · walk into things to climb · W jump · hold Space jetpack · S drop · click fire · E hammer · B bomb</span>
          </>
        )}
        <span className="text-stone-400 hidden lg:inline">Just for fun — nothing is saved or deleted.</span>
        <button data-testid="smash-exit" onClick={onExit} className="rounded-md bg-stone-900 px-2 py-1 text-stone-50 hover:bg-stone-800">Exit (Esc)</button>
      </div>
    </div>,
    document.body,
  );
}

// ── the game ────────────────────────────────────────────────────────────────────
function startGame({ ctx, W, H, dpr, SP, shot, blocks, keys, mouse, setSmashed, setWeapon }) {
  const dark = isDark();
  const ink = dark ? "#f3f0eb" : "#1c1917";
  const paper = makePaper(W, H, dark);
  // The page's own background is the top sheet: breaking something off it leaves clean
  // background, and only a tear or a blast goes through to the paper underneath.
  const sheet = css(readVar("--canvas", dark ? [22, 20, 18] : [250, 248, 245]).slice(0, 3));

  // The live page: blocks cut from the photo, drawn onto a transparent sheet so the
  // paper shows wherever nothing is. Every tear and break is drawn straight onto it.
  const page = document.createElement("canvas");
  page.width = W * SP; page.height = H * SP;
  const pg = page.getContext("2d");
  pg.setTransform(SP, 0, 0, SP, 0, 0);
  pg.fillStyle = sheet;
  pg.fillRect(0, 0, W, H);
  for (const b of blocks) {
    const w = b.r - b.l, h = b.b - b.t;
    if (b.kind === "letter") {
      pg.drawImage(shot, b.l * SP, b.t * SP, w * SP, h * SP, b.l, b.t, w, h);
    } else {
      pg.save(); roundRectPath(pg, b); pg.clip();
      pg.drawImage(shot, b.l * SP, b.t * SP, w * SP, h * SP, b.l, b.t, w, h);
      pg.restore();
    }
  }

  // What the stickman touches.
  const mask = new Uint8Array(W * H);
  const fillMask = (l, t, r, b, v) => {
    const x0 = Math.max(0, Math.floor(l)), x1 = Math.min(W, Math.ceil(r));
    const y0 = Math.max(0, Math.floor(t)), y1 = Math.min(H, Math.ceil(b));
    for (let y = y0; y < y1; y++) mask.fill(v, y * W + x0, y * W + x1);
  };
  const levelOf = (b) => (b.kind === "letter" || b.small ? THING : WALL);
  for (const b of blocks) {
    const v = levelOf(b);
    const x0 = Math.max(0, Math.floor(b.l)), x1 = Math.min(W, Math.ceil(b.r));
    const y0 = Math.max(0, Math.floor(b.t)), y1 = Math.min(H, Math.ceil(b.b));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask[y * W + x] < v) mask[y * W + x] = v;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? (y >= H ? THING : PAPER) : mask[(y | 0) * W + (x | 0)]);

  // Spatial grid of blocks, for "what's here?".
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
  const grid = Array.from({ length: cols * rows }, () => []);
  for (const b of blocks) {
    for (let cy = Math.max(0, Math.floor(b.t / CELL)); cy <= Math.min(rows - 1, Math.floor(b.b / CELL)); cy++) {
      for (let cx = Math.max(0, Math.floor(b.l / CELL)); cx <= Math.min(cols - 1, Math.floor(b.r / CELL)); cx++) grid[cy * cols + cx].push(b);
    }
    if (!b.small) {
      // Big blocks keep a grid of sample points to know how much of them is left.
      const n = Math.max(4, Math.min(80, Math.round(b.area / 1400)));
      const nx = Math.max(2, Math.round(Math.sqrt((n * (b.r - b.l)) / (b.b - b.t))));
      const ny = Math.max(2, Math.round(n / nx));
      b.samples = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        b.samples.push({ x: b.l + ((i + 0.5) / nx) * (b.r - b.l), y: b.t + ((j + 0.5) / ny) * (b.b - b.t), on: true });
      }
      b.left = b.samples.length;
    }
  }
  const blocksAt = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return [];
    return grid[Math.floor(y / CELL) * cols + Math.floor(x / CELL)].filter((b) => b.alive && x >= b.l && x <= b.r && y >= b.t && y <= b.b);
  };
  const topBlockAt = (x, y, ignore) => {
    let best = null;
    for (const b of blocksAt(x, y)) if (!(ignore && ignore.has(b)) && (!best || b.z > best.z)) best = b;
    return best;
  };

  // ── state ──
  let pieces = [], particles = [], bullets = [], rockets = [], bombs = [], rings = [], smoke = [], flames = [], swings = [], flashes = [];
  let count = 0, shake = 0, t = 0, fireCd = 0, rpgCd = 0, rayCd = 0, weaponNow = "blaster", beam = null;
  const bump = (n = 1) => { count += n; setSmashed(count); };

  const player = { x: W / 2, y: 0, vx: 0, vy: 0, onGround: false, jumps: 0, face: 1, phase: 0, dropUntil: 0, fuel: FUEL, jetting: false, climbing: false };
  // Start standing on the first thing below the top bar in the middle of the screen.
  {
    let y = 120;
    while (y < H - 2 && !(at(player.x, y) > at(player.x, y - 1))) y++;
    player.y = y;
  }

  // ── breaking things ──
  const behind = (b) => {
    for (let p = b.parent; p; p = p.parent) if (p.alive) return p;
    return null;
  };
  const kill = (b) => {
    if (!b.alive) return;
    b.alive = false;
    for (const k of b.kids) kill(k);
  };
  // Remove a block from the page: what was under it shows (its parent's surface, or paper).
  const erase = (b) => {
    const back = behind(b);
    pg.save();
    roundRectPath(pg, b);
    pg.fillStyle = back ? css(back.color) : sheet;
    pg.fill();
    pg.restore();
    fillMask(b.l, b.t, b.r, b.b, back ? levelOf(back) : PAPER);
    kill(b);
  };
  const cut = (l, t, w, h) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * SP)); c.height = Math.max(1, Math.ceil(h * SP));
    c.getContext("2d").drawImage(page, l * SP, t * SP, w * SP, h * SP, 0, 0, w * SP, h * SP);
    return c;
  };
  const addPiece = (p) => {
    pieces.push(p);
    if (pieces.length > MAX_PIECES) pieces.splice(0, pieces.length - MAX_PIECES);
  };
  // Break a block into textured pieces flying away from (hx, hy).
  const shatter = (b, hx, hy, power = 1) => {
    if (!b.alive) return;
    const w = b.r - b.l, h = b.b - b.t;
    const img = cut(b.l, b.t, w, h);
    const size = b.kind === "letter" ? Math.max(3, Math.min(w, h) / 2) : Math.max(6, Math.min(34, Math.sqrt(b.area / 14)));
    const nx = Math.max(1, Math.min(10, Math.round(w / size))), ny = Math.max(1, Math.min(8, Math.round(h / size)));
    const xs = [0], ys = [0];
    for (let i = 1; i < nx; i++) xs.push((i / nx + (Math.random() - 0.5) * (0.5 / nx)) * w);
    for (let j = 1; j < ny; j++) ys.push((j / ny + (Math.random() - 0.5) * (0.5 / ny)) * h);
    xs.push(w); ys.push(h);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const px = xs[i], py = ys[j], pw = xs[i + 1] - px, ph = ys[j + 1] - py;
      if (pw < 1 || ph < 1) continue;
      const cx = b.l + px + pw / 2, cy = b.t + py + ph / 2;
      const dx = cx - hx, dy = cy - hy, d = Math.hypot(dx, dy) || 1;
      const f = (180 + Math.random() * 320) * power;
      addPiece({
        img, sx: px * SP, sy: py * SP, sw: pw * SP, sh: ph * SP, x: cx, y: cy, w: pw, h: ph,
        vx: (dx / d) * f + (Math.random() - 0.5) * 140, vy: (dy / d) * f - 160 - Math.random() * 220 * power,
        rot: 0, vr: (Math.random() - 0.5) * 12, rest: false, age: 0,
      });
    }
    erase(b);
    bump();
  };
  // Pop a whole block off in one piece.
  const knockLoose = (b, hx, hy, power) => {
    if (!b.alive) return;
    const w = b.r - b.l, h = b.b - b.t;
    const img = cut(b.l, b.t, w, h);
    const cx = b.l + w / 2, cy = b.t + h / 2, dx = cx - hx, dy = cy - hy, d = Math.hypot(dx, dy) || 1;
    addPiece({ img, sx: 0, sy: 0, sw: w * SP, sh: h * SP, x: cx, y: cy, w, h, vx: (dx / d) * power, vy: (dy / d) * power - 200, rot: 0, vr: (Math.random() - 0.5) * 8, rest: false, age: 0 });
    erase(b);
    bump();
  };
  const dust = (x, y, r, n) => {
    const s = Math.max(2, r / 3);
    const img = cut(x - r, y - r, r * 2, r * 2);
    for (let i = 0; i < n; i++) {
      const px = Math.random() * (r * 2 - s), py = Math.random() * (r * 2 - s);
      const a = Math.random() * Math.PI * 2, f = 120 + Math.random() * 280;
      addPiece({ img, sx: px * SP, sy: py * SP, sw: s * SP, sh: s * SP, x: x - r + px + s / 2, y: y - r + py + s / 2, w: s, h: s, vx: Math.cos(a) * f, vy: Math.sin(a) * f - 150, rot: 0, vr: (Math.random() - 0.5) * 16, rest: false, age: 0 });
    }
  };
  const sparks = (x, y, color, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 300;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 90, life: 0.35, color });
    }
  };
  const loseSamples = (b, x, y, r) => {
    if (!b.samples || !b.alive) return;
    for (const s of b.samples) if (s.on && Math.hypot(s.x - x, s.y - y) <= r) { s.on = false; b.left -= 1; }
    if (b.left <= b.samples.length * 0.35) shatter(b, x, y, 0.8);
  };
  // Tear a hole in one big block: its parent's surface shows through.
  const tear = (b, x, y, r) => {
    dust(x, y, r, 4);
    const back = behind(b);
    pg.save();
    roundRectPath(pg, b); pg.clip();
    jagged(pg, x, y, r);
    if (back) { pg.fillStyle = css(back.color); pg.fill(); }
    else { pg.globalCompositeOperation = "destination-out"; pg.fill(); }
    pg.restore();
    // a darker rim, drawn only onto what's left, reads as the paper's torn edge
    pg.save(); pg.globalCompositeOperation = "source-atop";
    jagged(pg, x, y, r * 1.05); pg.strokeStyle = "rgba(0,0,0,0.22)"; pg.lineWidth = 1.5; pg.stroke();
    pg.restore();
    const v = back ? levelOf(back) : PAPER;
    const x0 = Math.max(0, Math.floor(Math.max(x - r, b.l))), x1 = Math.min(W, Math.ceil(Math.min(x + r, b.r)));
    const y0 = Math.max(0, Math.floor(Math.max(y - r, b.t))), y1 = Math.min(H, Math.ceil(Math.min(y + r, b.b)));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r * 0.8) mask[yy * W + xx] = v;
    }
    for (const k of b.kids) {
      if (!k.alive) continue;
      const kx = (k.l + k.r) / 2, ky = (k.t + k.b) / 2;
      if ((kx - x) ** 2 + (ky - y) ** 2 < r * r) kill(k);
    }
    loseSamples(b, x, y, r);
  };
  // What one hit does to whatever it lands on.
  const strike = (b, x, y, r) => {
    if (!b || !b.alive) return false;
    if (b.small) shatter(b, x, y);
    else tear(b, x, y, r);
    return true;
  };
  // Explosions go through every layer to the paper, and shove what's nearby.
  const explode = (x, y, R) => {
    const inside = new Set(), near = new Set();
    for (let cy = Math.max(0, Math.floor((y - R * 1.7) / CELL)); cy <= Math.min(rows - 1, Math.floor((y + R * 1.7) / CELL)); cy++) {
      for (let cx = Math.max(0, Math.floor((x - R * 1.7) / CELL)); cx <= Math.min(cols - 1, Math.floor((x + R * 1.7) / CELL)); cx++) {
        for (const b of grid[cy * cols + cx]) {
          if (!b.alive || !b.small) continue;
          const bx = Math.max(b.l, Math.min(x, b.r)), by = Math.max(b.t, Math.min(y, b.b));
          const d = Math.hypot(bx - x, by - y);
          if (d <= R) inside.add(b);
          else if (d <= R * 1.7) near.add(b);
        }
      }
    }
    for (const b of inside) shatter(b, x, y, 1.6);
    for (const b of near) if (Math.random() < 0.6) knockLoose(b, x, y, 380 + Math.random() * 260);
    dust(x, y, R * 0.6, 22);
    // tear every layer here down to the paper
    pg.save(); pg.globalCompositeOperation = "destination-out"; jagged(pg, x, y, R, 30); pg.fill(); pg.restore();
    pg.save(); pg.globalCompositeOperation = "source-atop"; jagged(pg, x, y, R * 1.04, 30);
    pg.strokeStyle = "rgba(40,20,0,0.35)"; pg.lineWidth = 3; pg.stroke(); pg.restore();
    for (let yy = Math.max(0, Math.floor(y - R)); yy < Math.min(H, Math.ceil(y + R)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - R)); xx < Math.min(W, Math.ceil(x + R)); xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= R * R * 0.78) mask[yy * W + xx] = PAPER;
      }
    }
    for (const b of blocks) {
      if (!b.alive || b.small) continue;
      if (b.r < x - R || b.l > x + R || b.b < y - R || b.t > y + R) continue;
      loseSamples(b, x, y, R);
    }
    sparks(x, y, "#ef4444", 30); sparks(x, y, "#f59e0b", 30); sparks(x, y, "#fde68a", 16);
    for (let i = 0; i < 14; i++) smoke.push({ x: x + (Math.random() - 0.5) * R * 0.5, y: y + (Math.random() - 0.5) * R * 0.5, r: 10 + Math.random() * 16, vy: -30 - Math.random() * 40, life: 0.9 + Math.random() * 0.5 });
    rings.push({ x, y, r: 10, max: R * 1.3, life: 0.35 });
    shake = Math.max(shake, R > 100 ? 0.35 : 0.22);
    for (const p of pieces) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < R * 1.8) { const f = (1 - d / (R * 1.8)) * 700; p.vx += ((p.x - x) / (d || 1)) * f; p.vy += ((p.y - y) / (d || 1)) * f - 200; p.rest = false; }
    }
  };

  // ── weapons ──
  const shoulder = () => ({ x: player.x, y: player.y - 45 });
  const aim = () => {
    const s = shoulder();
    const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
    player.face = dx >= 0 ? 1 : -1;
    return { s, ux: dx / d, uy: dy / d };
  };
  // Whatever he's standing in front of isn't what he's aiming at.
  const backdrop = (s) => new Set(blocksAt(s.x, s.y));

  const fire = () => {
    const { s, ux, uy } = aim();
    flashes.push({ x: s.x + ux * 26, y: s.y + uy * 26, life: 0.06 });
    bullets.push({ x: s.x, y: s.y, vx: ux * BULLET_SPEED, vy: uy * BULLET_SPEED, life: 1.2, ignore: backdrop(s) });
  };
  const fireRocket = () => {
    if (rpgCd > 0) return;
    rpgCd = RPG_COOLDOWN;
    const { s, ux, uy } = aim();
    rockets.push({ x: s.x, y: s.y, ux, uy, speed: 380, life: 2.5, ignore: backdrop(s) });
  };
  const throwBomb = () => {
    const { s, ux, uy } = aim();
    bombs.push({ x: s.x, y: s.y, vx: ux * 620, vy: uy * 620 - 240, fuse: 1.4 });
  };
  const hammer = () => {
    const s = shoulder();
    const dir = mouse.x >= player.x ? 1 : -1;
    player.face = dir;
    swings.push({ life: 0.22, dir });
    const hitSet = new Set();
    for (let a = -70; a <= 70; a += 12) {
      for (const reach of [26, 50, 76]) {
        const rad = (a * Math.PI) / 180;
        const x = s.x + Math.cos(rad) * reach * dir, y = s.y + Math.sin(rad) * reach;
        if (!at(x, y)) continue;
        const b = topBlockAt(x, y);
        if (b && !hitSet.has(b)) { hitSet.add(b); strike(b, x, y, 16); }
      }
    }
    shake = Math.max(shake, 0.08);
  };
  const attack = () => {
    if (weaponNow === "hammer") hammer();
    else if (weaponNow === "bomb") throwBomb();
    else if (weaponNow === "rpg") fireRocket();
    else if (weaponNow === "blaster") { fire(); fireCd = FIRE_EVERY; }
  };
  const traceRay = () => {
    const { s, ux, uy } = aim();
    const ignore = backdrop(s);
    const maxLen = Math.hypot(W, H);
    let x = s.x, y = s.y;
    for (let l = 8; l < maxLen; l += 3) {
      x = s.x + ux * l; y = s.y + uy * l;
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      if (!at(x, y)) continue;
      const b = topBlockAt(x, y, ignore);
      if (b) return { x1: s.x, y1: s.y, x2: x, y2: y, b };
    }
    return { x1: s.x, y1: s.y, x2: x, y2: y, b: null };
  };

  const keyDown = (k, repeat) => {
    const pick = WEAPONS[Number(k) - 1];
    if (pick) { weaponNow = pick[0]; setWeapon(pick[0]); }
    if (k === "e") hammer();
    if (k === "b") throwBomb();
    if ((k === "w" || k === "arrowup") && !repeat && player.jumps < 2) {
      player.vy = -JUMP; player.onGround = false; player.jumps += 1;
    }
    if (k === "s" || k === "arrowdown") player.dropUntil = t + 0.3;
  };

  // ── movement ──
  // He stands where the page steps up (paper → card, card → letter), and climbs
  // whatever is more solid than where he's standing.
  const landing = (x, y) => at(x, y) > at(x, y - 1);
  const stepPlayer = (dt) => {
    const left = keys.has("a") || keys.has("arrowleft");
    const right = keys.has("d") || keys.has("arrowright");
    player.vx = (right ? RUN : 0) - (left ? RUN : 0);
    if (player.vx) player.face = player.vx > 0 ? 1 : -1;

    const here = at(player.x, player.y - 20);
    const ax = player.x + player.face * 8;
    player.climbing = !!player.vx && t > player.dropUntil
      && (at(ax, player.y - 6) > here || at(ax, player.y - BODY / 2) > here || at(ax, player.y - BODY + 6) > here);

    if (player.climbing) player.vy = -CLIMB;
    else player.vy += GRAVITY * dt;

    player.jetting = keys.has(" ") && player.fuel > 0;
    if (player.jetting) {
      player.vy = Math.max(-MAX_RISE, player.vy - THRUST * dt);
      player.fuel = Math.max(0, player.fuel - dt);
      for (let i = 0; i < 3; i++) {
        flames.push({ x: player.x - player.face * 9 + (Math.random() - 0.5) * 6, y: player.y - 30, vx: (Math.random() - 0.5) * 60, vy: 260 + Math.random() * 200, life: 0.18 + Math.random() * 0.12 });
      }
    }

    const prevY = player.y;
    if (!player.climbing) player.x = Math.max(8, Math.min(W - 8, player.x + player.vx * dt));
    player.y = Math.max(BODY + 4, player.y + player.vy * dt);
    player.onGround = false;
    if (player.vy >= 0 && t > player.dropUntil) {
      for (let yy = Math.floor(prevY); yy <= Math.ceil(player.y); yy++) {
        if (landing(player.x, yy) || landing(player.x - 3, yy) || landing(player.x + 3, yy)) {
          player.y = yy; player.vy = 0; player.onGround = true; break;
        }
      }
    }
    if (player.y >= H - 1) { player.y = H - 1; player.vy = 0; player.onGround = true; }
    if (player.onGround) player.jumps = 0;
    if (!player.jetting) player.fuel = Math.min(FUEL, player.fuel + dt * (player.onGround ? 1.3 : 0.2));
    player.phase += (player.vx && (player.onGround || player.climbing) ? 14 : 0) * dt;
  };

  // ── one frame ──
  const step = (dt) => {
    t += dt;
    stepPlayer(dt);

    fireCd -= dt; rpgCd -= dt; rayCd -= dt;
    if (mouse.down && weaponNow === "blaster" && fireCd <= 0) { fire(); fireCd = FIRE_EVERY; }
    beam = null;
    if (mouse.down && weaponNow === "ray") {
      beam = traceRay();
      if (beam.b && rayCd <= 0) { strike(beam.b, beam.x2, beam.y2, 9); sparks(beam.x2, beam.y2, "#67e8f9", 4); rayCd = RAY_TICK; }
    }

    bullets = bullets.filter((b) => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        b.x += (b.vx * dt) / n; b.y += (b.vy * dt) / n;
        if (b.x < 0 || b.y < 0 || b.x >= W || b.y >= H) return false;
        if (!at(b.x, b.y)) continue;
        const hitB = topBlockAt(b.x, b.y, b.ignore);
        if (hitB) { strike(hitB, b.x, b.y, 11); sparks(b.x, b.y, "#fde68a", 5); return false; }
      }
      b.life -= dt;
      return b.life > 0;
    });

    rockets = rockets.filter((rk) => {
      rk.speed = Math.min(1500, rk.speed + 2400 * dt);
      rk.life -= dt;
      smoke.push({ x: rk.x - rk.ux * 14, y: rk.y - rk.uy * 14, r: 4 + Math.random() * 4, vy: -20, life: 0.6 });
      const n = 5;
      for (let i = 0; i < n; i++) {
        rk.x += (rk.ux * rk.speed * dt) / n; rk.y += (rk.uy * rk.speed * dt) / n;
        const out = rk.x < 0 || rk.y < 0 || rk.x >= W || rk.y >= H;
        if (out || (at(rk.x, rk.y) && topBlockAt(rk.x, rk.y, rk.ignore))) {
          explode(Math.max(0, Math.min(W, rk.x)), Math.max(0, Math.min(H, rk.y)), 120);
          return false;
        }
      }
      if (rk.life <= 0) { explode(rk.x, rk.y, 120); return false; }
      return true;
    });

    bombs = bombs.filter((b) => {
      b.vy += GRAVITY * 0.8 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.fuse -= dt;
      if (b.x < 0 || b.x > W) b.vx *= -0.5;
      if (b.fuse <= 0 || b.y >= H - 4 || (b.vy > 0 && landing(b.x, b.y))) { explode(b.x, Math.min(b.y, H - 4), 85); return false; }
      return true;
    });

    // pieces: fall, tumble, settle on whatever is still there
    for (const p of pieces) {
      p.age += dt;
      if (p.rest) {
        if (!at(p.x, p.y + p.h / 2 + 1) && p.y + p.h / 2 < H - 1) p.rest = false;
        else continue;
      }
      p.vy += GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.x < 0 || p.x > W) { p.vx *= -0.5; p.x = Math.max(0, Math.min(W, p.x)); }
      const foot = p.y + Math.min(p.h, p.w) / 2;
      if (p.vy > 0 && (foot >= H - 1 || landing(p.x, foot))) {
        if (foot >= H - 1) p.y = H - 1 - Math.min(p.h, p.w) / 2;
        p.vy *= -0.28; p.vx *= 0.6; p.vr *= 0.5;
        if (Math.abs(p.vy) < 60) { p.vy = 0; p.vx = 0; p.vr = 0; p.rest = true; }
      }
    }
    for (const q of particles) { q.vy += GRAVITY * 0.5 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
    particles = particles.filter((q) => q.life > 0);
    for (const f of flames) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }
    flames = flames.filter((f) => f.life > 0);
    for (const m of smoke) { m.y += m.vy * dt; m.r += 18 * dt; m.life -= dt; }
    smoke = smoke.filter((m) => m.life > 0);
    for (const g of rings) { g.r += (g.max - g.r) * 12 * dt; g.life -= dt; }
    rings = rings.filter((g) => g.life > 0);
    for (const s of swings) s.life -= dt;
    swings = swings.filter((s) => s.life > 0);
    for (const f of flashes) f.life -= dt;
    flashes = flashes.filter((f) => f.life > 0);
    shake = Math.max(0, shake - dt);

    draw();
  };

  // ── drawing ──
  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake > 0) { const k = (16 * shake) / 0.35; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    ctx.drawImage(paper, 0, 0, W, H);
    ctx.drawImage(page, 0, 0, W, H);

    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(-p.w / 2 + 1.5, -p.h / 2 + 2, p.w, p.h);
      ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    for (const m of smoke) {
      ctx.globalAlpha = Math.max(0, m.life) * 0.35;
      ctx.fillStyle = "#a8a29e";
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.lineCap = "round";
    for (const b of bullets) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.x - (b.vx / sp) * 28, ty = b.y - (b.vy / sp) * 28;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = "#fffbeb"; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of flashes) {
      ctx.globalAlpha = f.life / 0.06;
      ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const rk of rockets) {
      ctx.save();
      ctx.translate(rk.x, rk.y); ctx.rotate(Math.atan2(rk.uy, rk.ux));
      ctx.fillStyle = "#4d7c0f"; ctx.fillRect(-12, -3.5, 18, 7);
      ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(13, 0); ctx.lineTo(6, 3.5); ctx.fill();
      ctx.fillStyle = Math.random() > 0.5 ? "#f59e0b" : "#fde68a"; ctx.fillRect(-18, -2.5, 6, 5);
      ctx.restore();
    }
    for (const b of bombs) {
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = Math.sin(t * 30) > 0 ? "#ef4444" : "#f59e0b";
      ctx.fillRect(b.x - 1.5, b.y - 12, 3, 5);
    }
    for (const g of rings) {
      ctx.globalAlpha = Math.max(0, g.life / 0.35);
      ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (beam) {
      const wob = Math.sin(t * 60) * 1.5;
      ctx.globalAlpha = 0.25; ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 12 + wob;
      ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
      ctx.globalAlpha = 0.75; ctx.strokeStyle = "#67e8f9"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = "#ecfeff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
      ctx.fillStyle = "#ecfeff"; ctx.beginPath(); ctx.arc(beam.x2, beam.y2, 6 + wob, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of flames) {
      ctx.globalAlpha = Math.max(0, f.life / 0.3);
      ctx.fillStyle = f.life > 0.15 ? "#fde68a" : "#f97316";
      ctx.beginPath(); ctx.arc(f.x, f.y, 3 + f.life * 10, 0, Math.PI * 2); ctx.fill();
    }
    for (const q of particles) {
      ctx.globalAlpha = Math.max(0, q.life / 0.35);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    drawStickman(ctx, player, mouse, weaponNow, swings[0], ink);
    if (player.fuel < FUEL) {
      const gx = player.x - 18, gy = player.y - 82;
      ctx.fillStyle = "rgba(120,113,108,0.35)"; ctx.fillRect(gx, gy, 36, 4);
      ctx.fillStyle = player.fuel < FUEL * 0.25 ? "#ef4444" : "#22c55e";
      ctx.fillRect(gx, gy, 36 * (player.fuel / FUEL), 4);
    }
  };

  draw();
  return { step, attack, hammer, keyDown };
}

// ── the stickman ────────────────────────────────────────────────────────────────
const SCALE = 1.5;

function drawStickman(ctx, pos, mouse, weapon, swing, ink) {
  // Drawn at 1.5x about the feet; the maths below is in unscaled units.
  ctx.save();
  ctx.translate(pos.x, pos.y); ctx.scale(SCALE, SCALE); ctx.translate(-pos.x, -pos.y);
  const aimAt = { x: pos.x + (mouse.x - pos.x) / SCALE, y: pos.y + (mouse.y - pos.y) / SCALE };
  drawFigure(ctx, pos, aimAt, weapon, swing, ink);
  ctx.restore();
}

function drawFigure(ctx, p, mouse, weapon, swing, ink) {
  const hipY = p.y - 18, neckY = p.y - 34, headY = p.y - 42;
  // jetpack on his back
  const bx = p.x - p.face * 6;
  ctx.fillStyle = "#57534e"; ctx.fillRect(bx - 4, neckY + 1, 8, 13);
  ctx.fillStyle = "#a8a29e"; ctx.fillRect(bx - 3, neckY + 14, 6, 3);

  const leg = p.climbing ? Math.sin(p.phase) * 6 : !p.onGround ? 5 : p.vx ? Math.sin(p.phase) * 7 : 5;
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x, hipY); ctx.lineTo(p.x - leg, p.y);
  ctx.moveTo(p.x, hipY); ctx.lineTo(p.x + leg, p.y);
  ctx.moveTo(p.x, hipY); ctx.lineTo(p.x, neckY);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, headY, 7, 0, Math.PI * 2); ctx.stroke();

  const sx = p.x, sy = p.y - 30;
  let ang = Math.atan2(mouse.y - sy, mouse.x - sx);
  if (swing) ang = (swing.dir > 0 ? -1.2 : Math.PI + 1.2) + (1 - swing.life / 0.22) * 2.4 * swing.dir;
  const hx = sx + Math.cos(ang) * 16, hy = sy + Math.sin(ang) * 16;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();

  ctx.save();
  ctx.translate(hx, hy); ctx.rotate(ang);
  if (weapon === "hammer" || swing) {
    ctx.fillStyle = "#78716c"; ctx.fillRect(0, -1.5, 18, 3);
    ctx.fillStyle = "#57534e"; ctx.fillRect(16, -7, 8, 14);
  } else if (weapon === "ray") {
    ctx.fillStyle = "#0e7490"; ctx.fillRect(0, -3.5, 13, 7);
    ctx.fillStyle = "#155e75"; ctx.fillRect(2, 2, 4, 5);
    ctx.fillStyle = "#67e8f9"; ctx.fillRect(13, -2, 5, 4);
    ctx.beginPath(); ctx.arc(19, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (weapon === "rpg") {
    ctx.fillStyle = "#4d7c0f"; ctx.fillRect(-8, -4, 30, 8);
    ctx.fillStyle = "#365314"; ctx.fillRect(2, 3, 4, 5);
    ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.moveTo(22, -4); ctx.lineTo(28, 0); ctx.lineTo(22, 4); ctx.fill();
  } else if (weapon === "bomb") {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = "#C0512F"; ctx.fillRect(0, -3, 14, 6);
    ctx.fillStyle = ink; ctx.fillRect(2, 2, 4, 5);
  }
  ctx.restore();
}
