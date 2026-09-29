import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Icons from "lucide-react";

/**
 * Smash mode: a stickman who shoots, hammers and bombs whatever page you're on.
 *
 * It is purely a picture of destruction. Nothing here calls the API or changes app
 * state, and nothing underneath can be clicked or typed into while it runs:
 *
 * - a full-screen layer takes every pointer event, and a capturing key handler
 *   swallows every key (except browser shortcuts like Ctrl+R), so no button, form or
 *   shortcut in the app can fire;
 * - "destroying" an element only sets `visibility: hidden` on it (layout doesn't move)
 *   and draws its fragments on a canvas. Each element's original inline visibility is
 *   remembered and put back on exit — or a reload, since none of it is stored.
 *
 * Hit-testing uses document.elementsFromPoint, so a shot takes out the top-most thing
 * it touches: a word first, then the badge it sat in, then the card behind that.
 */

const GRAVITY = 1900;
const RUN = 330;
const JUMP = 640;
const BULLET_SPEED = 1150;
const FIRE_EVERY = 0.12;
const MAX_SHARDS = 700;
// Jetpack: hold Space. Net lift is THRUST - GRAVITY; fuel refills fast on the ground,
// slowly in the air, so it's for hopping between panels rather than hovering forever.
const THRUST = 3400;
const MAX_RISE = 560;
const FUEL = 2.4;
const RAY_STEP = 18;
const RAY_TICK = 0.07;
const RPG_COOLDOWN = 0.8;
// Letters: how many we track, and how fast the stickman climbs text he walks into.
const MAX_LETTERS = 7000;
const CLIMB = 240;
const BODY = 60;          // his height on screen (the figure is drawn at 1.5x)

function parseColor(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || "");
  if (!m) return null;
  const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
  return [Number(r), Number(g), Number(b), Number(a)];
}

const WEAPONS = [
  ["blaster", "1 Blaster"],
  ["ray", "2 Ray gun"],
  ["rpg", "3 RPG"],
  ["hammer", "4 Hammer"],
  ["bomb", "5 Bomb"],
];

function readInk() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--stone-900").trim();
  return v ? `rgb(${v.split(/\s+/).join(",")})` : "#1c1917";
}

function isTransparent(c) {
  return !c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
}

export default function SmashMode({ onExit }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const [smashed, setSmashed] = useState(0);
  const [weapon, setWeapon] = useState("blaster");

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const ink = readInk();
    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Nothing typed during the game should land in a field that had focus.
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

    // ── what's been hidden, so it can all be put back ────────────────────────────
    const hidden = new Map();          // element -> original inline visibility
    const hp = new WeakMap();
    const isOurs = (el) => root.contains(el);
    const hiddenByUs = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) if (hidden.has(n)) return true;
      return false;
    };

    // ── platforms: tops of visible boxes the stickman can stand on ───────────────
    let platforms = [];
    const collectPlatforms = () => {
      const out = [];
      const all = document.body.querySelectorAll("*");
      for (const el of all) {
        if (isOurs(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 60 || r.height < 18 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
        if (r.width > W * 0.95 && r.height > H * 0.8) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        const solid = !isTransparent(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0
          || ["BUTTON", "INPUT", "IMG", "TEXTAREA"].includes(el.tagName);
        if (solid) out.push({ el, left: r.left, right: r.right, top: r.top });
      }
      return out;
    };
    platforms = collectPlatforms();
    const livePlatforms = () => platforms.filter((p) => !hiddenByUs(p.el));
    let standable = livePlatforms();

    // ── world state ──────────────────────────────────────────────────────────────
    const player = { x: W / 2, y: H - 2, vx: 0, vy: 0, onGround: true, jumps: 0, face: 1, phase: 0, dropUntil: 0, fuel: FUEL, jetting: false };
    const keys = new Set();
    const mouse = { x: W / 2, y: H / 2, down: false };
    let bullets = [], bombs = [], rockets = [], shards = [], sparks = [], swings = [], flames = [], smoke = [], rings = [];
    let fireCd = 0, rpgCd = 0, rayCd = 0, shake = 0, count = 0, weaponNow = "blaster", t = 0;
    let beam = null;
    let flashes = [];

    // Only things you can actually see are targets. An empty layout wrapper — say the
    // scroll box a smashed table sat in — has no background, border or text of its own,
    // and would otherwise stop every shot at an invisible wall.
    const painted = new WeakMap();
    const hasPaint = (el) => {
      if (painted.has(el)) return painted.get(el);
      let yes = el instanceof SVGElement || ["IMG", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "VIDEO", "CANVAS"].includes(el.tagName);
      if (!yes) {
        const cs = getComputedStyle(el);
        yes = !isTransparent(cs.backgroundColor) || cs.backgroundImage !== "none"
          || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0
          || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0
          || cs.boxShadow !== "none";
      }
      painted.set(el, yes);
      return yes;
    };
    const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

    // ── letters: every character on screen is its own target and foothold ────────
    // The page's text is never touched. The browser reports each character's box
    // (a Range over one character); a smashed letter is painted over on the canvas
    // with whatever colour is behind it, and bursts into fragments of its own colour.
    const letters = [];
    const lettersByOwner = new Map();
    {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let node;
      while ((node = walker.nextNode()) && letters.length < MAX_LETTERS) {
        const el = node.parentElement;
        if (!el || isOurs(el) || !node.textContent.trim()) continue;
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        if (box.width < 1 || box.bottom < 0 || box.top > H || box.right < 0 || box.left > W) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        const text = node.textContent;
        for (let i = 0; i < text.length && letters.length < MAX_LETTERS; i++) {
          if (/\s/.test(text[i])) continue;
          range.setStart(node, i); range.setEnd(node, i + 1);
          const rc = range.getClientRects()[0];
          if (!rc || rc.width < 1 || rc.bottom < 0 || rc.top > H) continue;
          const L = { el, l: rc.left, r: rc.right, t: rc.top, b: rc.bottom, alive: true, patch: null };
          letters.push(L);
          if (!lettersByOwner.has(el)) lettersByOwner.set(el, []);
          lettersByOwner.get(el).push(L);
        }
      }
      range.detach?.();
    }
    const deadLetters = [];
    let liveLetters = letters.slice();
    let liveSet = new Set(liveLetters);
    let lettersDirty = false;
    const refreshLive = () => {
      if (!lettersDirty) return;
      liveLetters = letters.filter((q) => q.alive && !hiddenByUs(q.el));
      liveSet = new Set(liveLetters);
      lettersDirty = false;
    };

    // A big panel is scenery while it still has words on it: shots cross its background
    // and hit the text and badges, so you can see every shot travel. Once it's been
    // emptied, the panel itself is fair game.
    const BACKDROP_AREA = 30000;
    const lettersInside = new WeakMap();
    const hasLiveContent = (el) => {
      if (!lettersInside.has(el)) lettersInside.set(el, letters.filter((q) => q.el !== el && el.contains(q.el)));
      return lettersInside.get(el).some((q) => liveSet.has(q));
    };

    // `from` is where a shot was fired. Anything covering that spot is the backdrop the
    // stickman is standing in front of — shots fly past it rather than hitting it
    // point-blank, which is what makes a gun aim at things instead of the wall.
    // Returns { el } for an element, or { el, letter } for one character.
    const pickTarget = (x, y, from = null) => {
      if (x < 0 || y < 0 || x > W || y > H) return null;
      refreshLive();
      const area = W * H;
      for (const el of document.elementsFromPoint(x, y)) {
        if (isOurs(el) || el === document.documentElement || el === document.body || el.id === "root") continue;
        const rc = el.getBoundingClientRect();
        if (rc.width * rc.height > area * 0.6) return null;   // page-sized wrappers aren't targets
        if (from && from.x >= rc.left && from.x <= rc.right && from.y >= rc.top && from.y <= rc.bottom) continue;
        const own = lettersByOwner.get(el);
        if (own) {
          const L = own.find((q) => q.alive && x >= q.l - 1 && x <= q.r + 1 && y >= q.t && y <= q.b);
          if (L) return { el, letter: L };
          if (hasPaint(el) && !(rc.width * rc.height > BACKDROP_AREA && hasLiveContent(el))) return { el };
          continue;                                            // between letters: fly on
        }
        if (hasPaint(el) && rc.width * rc.height > BACKDROP_AREA && hasLiveContent(el)) continue;
        if (hasPaint(el) || hasOwnText(el)) return { el };
      }
      return null;
    };

    const colourBehind = (el) => {
      // Walk up to the first opaque background, blending any see-through ones on the way.
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parseColor(getComputedStyle(n).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      const base = parseColor(`rgb(${getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim().split(/\s+/).join(",")})`) || [250, 248, 245, 1];
      let out = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop().slice(0, 3) : base.slice(0, 3);
      for (let i = layers.length - 1; i >= 0; i--) {
        const [cr, cg, cb, ca] = layers[i];
        out = [cr * ca + out[0] * (1 - ca), cg * ca + out[1] * (1 - ca), cb * ca + out[2] * (1 - ca)];
      }
      return `rgb(${out.map(Math.round).join(",")})`;
    };

    const spawnSparks = (x, y, color, n = 6) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 120 + Math.random() * 260;
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: 0.35, color });
      }
    };

    const destroy = (el, hx, hy) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const color = !isTransparent(cs.backgroundColor) ? cs.backgroundColor : cs.color;
      hidden.set(el, el.style.visibility);
      el.style.visibility = "hidden";
      const n = Math.max(6, Math.min(36, Math.round((r.width * r.height) / 450)));
      for (let i = 0; i < n && shards.length < MAX_SHARDS; i++) {
        const sx = r.left + Math.random() * r.width;
        const sy = r.top + Math.random() * r.height;
        const dx = sx - hx, dy = sy - hy, d = Math.hypot(dx, dy) || 1;
        const force = 260 + Math.random() * 380;
        const size = Math.max(3, Math.min(r.width, r.height, 26) * (0.25 + Math.random() * 0.5));
        shards.push({
          x: sx, y: sy, w: size * (0.6 + Math.random()), h: size * (0.4 + Math.random() * 0.8),
          vx: (dx / d) * force + (Math.random() - 0.5) * 120, vy: (dy / d) * force - 220 - Math.random() * 200,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 14, life: 2.2 + Math.random() * 1.2, color,
        });
      }
      spawnSparks(hx, hy, "#f59e0b", 10);
      count += 1;
      setSmashed(count);
      standable = livePlatforms();
      lettersDirty = true;
    };

    const destroyLetter = (L, hx, hy) => {
      L.alive = false;
      L.patch = colourBehind(L.el);
      deadLetters.push(L);
      lettersDirty = true;
      const color = getComputedStyle(L.el).color;
      const w = L.r - L.l, h = L.b - L.t;
      for (let i = 0; i < 5 && shards.length < MAX_SHARDS; i++) {
        const sx = L.l + Math.random() * w, sy = L.t + Math.random() * h;
        const dx = sx - hx, dy = sy - hy, d = Math.hypot(dx, dy) || 1;
        shards.push({
          x: sx, y: sy, w: 2 + Math.random() * w * 0.5, h: 2 + Math.random() * h * 0.35,
          vx: (dx / d) * 220 + (Math.random() - 0.5) * 160, vy: (dy / d) * 220 - 180 - Math.random() * 160,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 18, life: 1.4 + Math.random() * 0.8, color,
        });
      }
      spawnSparks(hx, hy, "#fbbf24", 3);
      count += 1;
      setSmashed(count);
    };

    const hit = (target, dmg, hx, hy) => {
      if (!target) return false;
      if (target.letter) {
        if (!target.letter.alive || hiddenByUs(target.el)) return false;
        destroyLetter(target.letter, hx, hy);
        return true;
      }
      const el = target.el;
      if (hiddenByUs(el)) return false;
      if (!hp.has(el)) {
        const r = el.getBoundingClientRect();
        const a = r.width * r.height;
        // Small things pop in one shot; a whole panel takes a proper beating.
        hp.set(el, a < 6000 ? 1 : Math.min(18, 1 + Math.ceil(a / 18000)));
      }
      const left = hp.get(el) - dmg;
      hp.set(el, left);
      if (left <= 0) { destroy(el, hx, hy); return true; }
      // Still standing: a shake (Web Animations, so the element's own style is untouched).
      el.animate(
        [{ transform: "translate(0,0)" }, { transform: "translate(-4px,2px) rotate(-1deg)" }, { transform: "translate(4px,-2px) rotate(1deg)" }, { transform: "translate(0,0)" }],
        { duration: 180 },
      );
      spawnSparks(hx, hy, "#fbbf24", 5);
      return true;
    };

    const blastArea = (cx, cy, radius, dmg) => {
      const seen = new Set();
      for (let ring = 0; ring <= radius; ring += radius / 3) {
        const steps = ring === 0 ? 1 : Math.round((ring * Math.PI * 2) / 26);
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const tg = pickTarget(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring);
          const key = tg && (tg.letter || tg.el);
          if (key && !seen.has(key)) { seen.add(key); hit(tg, dmg, cx, cy); }
        }
      }
    };

    const shoulder = () => ({ x: player.x, y: player.y - 45 });

    const fire = () => {
      const s = shoulder();
      const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
      flashes.push({ x: s.x + (dx / d) * 26, y: s.y + (dy / d) * 26, life: 0.06 });
      bullets.push({ x: s.x, y: s.y, from: { x: s.x, y: s.y }, vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED, life: 1.1 });
      player.face = dx >= 0 ? 1 : -1;
    };

    const swingHammer = () => {
      const s = shoulder();
      const dir = mouse.x >= player.x ? 1 : -1;
      player.face = dir;
      swings.push({ life: 0.22, dir });
      const seen = new Set();
      for (let a = -70; a <= 70; a += 14) {
        for (const reach of [30, 55, 80]) {
          const rad = (a * Math.PI) / 180;
          const tg = pickTarget(s.x + Math.cos(rad) * reach * dir, s.y + Math.sin(rad) * reach);
          const key = tg && (tg.letter || tg.el);
          if (key && !seen.has(key)) { seen.add(key); hit(tg, 2, s.x + 40 * dir, s.y); }
        }
      }
    };

    const throwBomb = () => {
      const s = shoulder();
      const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
      bombs.push({ x: s.x, y: s.y, vx: (dx / d) * 620, vy: (dy / d) * 620 - 240, fuse: 1.4 });
    };

    const fireRocket = () => {
      if (rpgCd > 0) return;
      rpgCd = RPG_COOLDOWN;
      const s = shoulder();
      const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
      rockets.push({ x: s.x, y: s.y, from: { x: s.x, y: s.y }, dx: dx / d, dy: dy / d, speed: 380, life: 2.5 });
      player.face = dx >= 0 ? 1 : -1;
    };

    const explode = (x, y, radius, dmg) => {
      blastArea(x, y, radius, dmg);
      spawnSparks(x, y, "#ef4444", 30);
      spawnSparks(x, y, "#f59e0b", 30);
      spawnSparks(x, y, "#fde68a", 16);
      for (let i = 0; i < 14; i++) {
        smoke.push({ x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40, r: 10 + Math.random() * 14, vy: -30 - Math.random() * 40, life: 0.9 + Math.random() * 0.5 });
      }
      rings.push({ x, y, r: 10, max: radius * 1.3, life: 0.35 });
      shake = Math.max(shake, radius > 120 ? 0.35 : 0.2);
    };

    // The ray gun is continuous: every frame it traces from the hand towards the cursor
    // and burns the first thing in the way.
    const traceRay = () => {
      const s = shoulder();
      const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const maxLen = Math.hypot(W, H);
      let x = s.x, y = s.y;
      for (let l = 0; l < maxLen; l += RAY_STEP) {
        x = s.x + ux * l; y = s.y + uy * l;
        if (x < 0 || y < 0 || x > W || y > H) break;
        const tg = pickTarget(x, y, s);
        if (tg) return { x1: s.x, y1: s.y, x2: x, y2: y, target: tg };
      }
      return { x1: s.x, y1: s.y, x2: x, y2: y, target: null };
    };

    const attack = () => {
      if (weaponNow === "hammer") swingHammer();
      else if (weaponNow === "bomb") throwBomb();
      else if (weaponNow === "rpg") fireRocket();
      else if (weaponNow === "blaster") fire();
      // the ray gun works while the button is held — see the loop
    };

    // ── input: everything is swallowed so the app underneath never sees it ───────
    const setW = (w) => { weaponNow = w; setWeapon(w); };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;           // leave browser shortcuts alone
      e.preventDefault();
      e.stopImmediatePropagation();
      const k = e.key.toLowerCase();
      if (k === "escape") { onExit(); return; }
      const pick = WEAPONS[Number(k) - 1];
      if (pick) setW(pick[0]);
      if (k === "e") swingHammer();
      if (k === "b") throwBomb();
      if ((k === "w" || k === "arrowup") && !e.repeat && player.jumps < 2) {
        player.vy = -JUMP; player.onGround = false; player.jumps += 1;
      }
      if (k === "s" || k === "arrowdown") player.dropUntil = t + 0.25;
      keys.add(k);
    };
    const onKeyUp = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      keys.delete(e.key.toLowerCase());
    };
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onDown = (e) => {
      e.preventDefault();
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (e.button === 2) { swingHammer(); return; }
      mouse.down = true;
      attack();
      fireCd = FIRE_EVERY * 2;
    };
    const onUp = () => { mouse.down = false; };
    const noMenu = (e) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    root.addEventListener("contextmenu", noMenu);

    // ── loop ─────────────────────────────────────────────────────────────────────
    let last = performance.now();
    let raf = 0;
    const step = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now; t += dt;

      // player
      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");
      player.vx = (right ? RUN : 0) - (left ? RUN : 0);
      if (player.vx) player.face = player.vx > 0 ? 1 : -1;
      // Walking into letters at body height climbs them, like a wall.
      refreshLive();
      player.climbing = false;
      if (player.vx) {
        const ahead = player.x + player.face * 7;
        for (const q of liveLetters) {
          if (ahead >= q.l - 1 && ahead <= q.r + 1 && q.b > player.y - BODY && q.t < player.y - 2) { player.climbing = true; break; }
        }
      }
      if (player.climbing) player.vy = -CLIMB;
      else player.vy += GRAVITY * dt;
      player.jetting = keys.has(" ") && player.fuel > 0;
      if (player.jetting) {
        player.vy = Math.max(-MAX_RISE, player.vy - THRUST * dt);
        player.fuel = Math.max(0, player.fuel - dt);
        const backX = player.x - player.face * 9;
        for (let i = 0; i < 3; i++) {
          flames.push({ x: backX + (Math.random() - 0.5) * 6, y: player.y - 30, vx: (Math.random() - 0.5) * 60, vy: 260 + Math.random() * 200, life: 0.18 + Math.random() * 0.12 });
        }
      }
      const prevY = player.y;
      // While climbing he holds his place against the wall rather than walking through it.
      if (!player.climbing) player.x = Math.max(8, Math.min(W - 8, player.x + player.vx * dt));
      player.y += player.vy * dt;
      player.onGround = false;
      if (player.vy >= 0 && t > player.dropUntil) {
        for (const p of standable) {
          if (player.x >= p.left && player.x <= p.right && prevY <= p.top + 1 && player.y >= p.top) {
            player.y = p.top; player.vy = 0; player.onGround = true; break;
          }
        }
        if (!player.onGround) {
          for (const q of liveLetters) {
            if (player.x >= q.l - 1 && player.x <= q.r + 1 && prevY <= q.t + 1 && player.y >= q.t) {
              player.y = q.t; player.vy = 0; player.onGround = true; break;
            }
          }
        }
      }
      if (player.y >= H - 2) { player.y = H - 2; player.vy = 0; player.onGround = true; }
      if (player.onGround) player.jumps = 0;
      if (!player.jetting) player.fuel = Math.min(FUEL, player.fuel + dt * (player.onGround ? 1.3 : 0.2));
      // Standing on something that just got smashed: fall.
      player.phase += (player.vx && (player.onGround || player.climbing) ? 14 : 0) * dt;

      // weapons
      fireCd -= dt; rpgCd -= dt; rayCd -= dt;
      if (mouse.down && weaponNow === "blaster" && fireCd <= 0) { fire(); fireCd = FIRE_EVERY; }
      beam = null;
      if (mouse.down && weaponNow === "ray") {
        beam = traceRay();
        if (beam.target && rayCd <= 0) {
          hit(beam.target, 1, beam.x2, beam.y2);
          spawnSparks(beam.x2, beam.y2, "#67e8f9", 4);
          rayCd = RAY_TICK;
        }
      }

      rockets = rockets.filter((rk) => {
        rk.speed = Math.min(1500, rk.speed + 2400 * dt);
        rk.life -= dt;
        smoke.push({ x: rk.x - rk.dx * 14, y: rk.y - rk.dy * 14, r: 4 + Math.random() * 4, vy: -20, life: 0.6 });
        const steps = 3;
        for (let i = 0; i < steps; i++) {
          rk.x += (rk.dx * rk.speed * dt) / steps; rk.y += (rk.dy * rk.speed * dt) / steps;
          const out = rk.x < 0 || rk.y < 0 || rk.x > W || rk.y > H;
          if (out || pickTarget(rk.x, rk.y, rk.from)) {
            explode(Math.max(0, Math.min(W, rk.x)), Math.max(0, Math.min(H, rk.y)), 150, 6);
            return false;
          }
        }
        if (rk.life <= 0) { explode(rk.x, rk.y, 150, 6); return false; }
        return true;
      });

      bullets = bullets.filter((b) => {
        const steps = 4;
        for (let i = 0; i < steps; i++) {
          b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
          const tg = pickTarget(b.x, b.y, b.from);
          if (tg && hit(tg, 1, b.x, b.y)) { spawnSparks(b.x, b.y, "#fde68a", 4); return false; }
        }
        b.life -= dt;
        return b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20;
      });

      bombs = bombs.filter((b) => {
        b.vy += GRAVITY * 0.8 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.fuse -= dt;
        const landed = b.y >= H - 4 || standable.some((p) => b.x >= p.left && b.x <= p.right && Math.abs(b.y - p.top) < 6 && b.vy > 0);
        if (b.fuse <= 0 || landed) { explode(b.x, b.y, 95, 3); return false; }
        return true;
      });

      for (const s of shards) {
        s.vy += GRAVITY * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.life -= dt;
        if (s.y > H - s.h / 2) { s.y = H - s.h / 2; s.vy *= -0.35; s.vx *= 0.7; s.vr *= 0.6; }
      }
      shards = shards.filter((s) => s.life > 0);
      for (const s of sparks) { s.vy += GRAVITY * 0.5 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of swings) s.life -= dt;
      swings = swings.filter((s) => s.life > 0);
      for (const f of flames) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }
      flames = flames.filter((f) => f.life > 0);
      for (const m of smoke) { m.y += m.vy * dt; m.r += 18 * dt; m.life -= dt; }
      smoke = smoke.filter((m) => m.life > 0);
      for (const g of rings) { g.r += (g.max - g.r) * 12 * dt; g.life -= dt; }
      rings = rings.filter((g) => g.life > 0);
      shake = Math.max(0, shake - dt);
      for (const f of flashes) f.life -= dt;
      flashes = flashes.filter((f) => f.life > 0);

      // draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (shake > 0) {
        const k = (16 * shake) / 0.35;
        ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      }
      for (const m of smoke) {
        ctx.globalAlpha = Math.max(0, m.life) * 0.35;
        ctx.fillStyle = "#a8a29e";
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Smashed letters: cover each with the colour behind it (unless its whole element
      // has since gone, in which case there's nothing left to cover).
      for (const q of deadLetters) {
        if (hiddenByUs(q.el)) continue;
        ctx.fillStyle = q.patch;
        ctx.fillRect(q.l - 0.5, q.t, q.r - q.l + 1, q.b - q.t);
      }
      for (const s of shards) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.life / 0.6);
        ctx.translate(s.x, s.y); ctx.rotate(s.rot);
        ctx.fillStyle = s.color;
        ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        // An edge in the ink colour, so dark fragments still show on a dark page.
        ctx.globalAlpha *= 0.45;
        ctx.strokeStyle = ink; ctx.lineWidth = 1;
        ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
      }
      for (const s of sparks) {
        ctx.globalAlpha = Math.max(0, s.life / 0.35);
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      // Bullets: a glowing tracer so you can see where every shot is going.
      ctx.lineCap = "round";
      for (const b of bullets) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const tx = b.x - (b.vx / sp) * 26, ty = b.y - (b.vy / sp) * 26;
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
        ctx.translate(rk.x, rk.y); ctx.rotate(Math.atan2(rk.dy, rk.dx));
        ctx.fillStyle = "#4d7c0f"; ctx.fillRect(-12, -3.5, 18, 7);
        ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(13, 0); ctx.lineTo(6, 3.5); ctx.fill();
        ctx.fillStyle = Math.random() > 0.5 ? "#f59e0b" : "#fde68a"; ctx.fillRect(-18, -2.5, 6, 5);
        ctx.restore();
      }
      for (const g of rings) {
        ctx.globalAlpha = Math.max(0, g.life / 0.35);
        ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (beam) {
        const wob = Math.sin(t * 60) * 1.5;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.25; ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 12 + wob;
        ctx.beginPath(); ctx.moveTo(beam.x1, beam.y1); ctx.lineTo(beam.x2, beam.y2); ctx.stroke();
        ctx.globalAlpha = 0.7; ctx.strokeStyle = "#67e8f9"; ctx.lineWidth = 5;
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
      ctx.globalAlpha = 1;
      for (const b of bombs) {
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Math.sin(t * 30) > 0 ? "#ef4444" : "#f59e0b";
        ctx.fillRect(b.x - 1.5, b.y - 12, 3, 5);
      }

      drawStickman(ctx, player, mouse, weaponNow, swings[0], ink);
      // Fuel gauge over his head, only while it isn't full.
      if (player.fuel < FUEL) {
        const gx = player.x - 18, gy = player.y - 82;
        ctx.fillStyle = "rgba(120,113,108,0.35)"; ctx.fillRect(gx, gy, 36, 4);
        ctx.fillStyle = player.fuel < FUEL * 0.25 ? "#ef4444" : "#22c55e";
        ctx.fillRect(gx, gy, 36 * (player.fuel / FUEL), 4);
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("contextmenu", noMenu);
      // Put the page back exactly as it was.
      for (const [el, vis] of hidden) el.style.visibility = vis;
      hidden.clear();
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
        <span className="font-mono text-[#C0512F]" data-testid="smash-count">{smashed} smashed</span>
        <span className="flex items-center gap-1">
          {WEAPONS.map(([k, label]) => (
            <span key={k} className={`rounded px-1.5 py-0.5 border ${weapon === k ? "border-stone-800 bg-stone-900 text-stone-50" : "border-stone-200"}`}>{label}</span>
          ))}
        </span>
        <span className="text-stone-500 hidden md:inline">A/D move (walk into text to climb it) · W jump · hold Space jetpack · S drop · click to fire · E hammer · B bomb</span>
        <span className="text-stone-400 hidden lg:inline">Just for fun — nothing is saved or deleted.</span>
        <button data-testid="smash-exit" onClick={onExit} className="rounded-md bg-stone-900 px-2 py-1 text-stone-50 hover:bg-stone-800">Exit (Esc)</button>
      </div>
    </div>,
    document.body,
  );
}

const SCALE = 1.5;

function drawStickman(ctx, pos, mouse, weapon, swing, ink) {
  // Drawn at 1.5x about the feet; the maths below is in unscaled units.
  ctx.save();
  ctx.translate(pos.x, pos.y); ctx.scale(SCALE, SCALE); ctx.translate(-pos.x, -pos.y);
  const p = pos;
  const aim = { x: pos.x + (mouse.x - pos.x) / SCALE, y: pos.y + (mouse.y - pos.y) / SCALE };
  drawFigure(ctx, p, aim, weapon, swing, ink);
  ctx.restore();
}

function drawFigure(ctx, p, mouse, weapon, swing, ink) {
  const hipY = p.y - 18, neckY = p.y - 34, headY = p.y - 42;
  // jetpack on his back
  const bx = p.x - p.face * 6;
  ctx.fillStyle = "#57534e"; ctx.fillRect(bx - 4, neckY + 1, 8, 13);
  ctx.fillStyle = "#a8a29e"; ctx.fillRect(bx - 3, neckY + 14, 6, 3);
  const leg = !p.onGround ? 5 : p.vx ? Math.sin(p.phase) * 7 : 5;
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x, hipY); ctx.lineTo(p.x - leg, p.y);          // legs
  ctx.moveTo(p.x, hipY); ctx.lineTo(p.x + leg, p.y);
  ctx.moveTo(p.x, hipY); ctx.lineTo(p.x, neckY);               // body
  ctx.stroke();
  ctx.beginPath(); ctx.arc(p.x, headY, 7, 0, Math.PI * 2); ctx.stroke();

  // arm towards the aim point
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
