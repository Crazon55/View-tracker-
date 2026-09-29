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
    const player = { x: W / 2, y: H - 2, vx: 0, vy: 0, onGround: true, jumps: 0, face: 1, phase: 0, dropUntil: 0 };
    const keys = new Set();
    const mouse = { x: W / 2, y: H / 2, down: false };
    let bullets = [], bombs = [], shards = [], sparks = [], swings = [];
    let fireCd = 0, count = 0, weaponNow = "blaster", t = 0;

    const pickTarget = (x, y) => {
      if (x < 0 || y < 0 || x > W || y > H) return null;
      const area = W * H;
      for (const el of document.elementsFromPoint(x, y)) {
        if (isOurs(el) || el === document.documentElement || el === document.body || el.id === "root") continue;
        const r = el.getBoundingClientRect();
        if (r.width * r.height > area * 0.6) return null;   // page-sized wrappers aren't targets
        return el;
      }
      return null;
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
    };

    const hit = (el, dmg, hx, hy) => {
      if (!el || hiddenByUs(el)) return false;
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
          const el = pickTarget(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring);
          if (el && !seen.has(el)) { seen.add(el); hit(el, dmg, cx, cy); }
        }
      }
    };

    const shoulder = () => ({ x: player.x, y: player.y - 45 });

    const fire = () => {
      const s = shoulder();
      const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
      bullets.push({ x: s.x, y: s.y, vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED, life: 1.1 });
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
          const el = pickTarget(s.x + Math.cos(rad) * reach * dir, s.y + Math.sin(rad) * reach);
          if (el && !seen.has(el)) { seen.add(el); hit(el, 2, s.x + 40 * dir, s.y); }
        }
      }
    };

    const throwBomb = () => {
      const s = shoulder();
      const dx = mouse.x - s.x, dy = mouse.y - s.y, d = Math.hypot(dx, dy) || 1;
      bombs.push({ x: s.x, y: s.y, vx: (dx / d) * 620, vy: (dy / d) * 620 - 240, fuse: 1.4 });
    };

    const attack = () => {
      if (weaponNow === "hammer") swingHammer();
      else if (weaponNow === "bomb") throwBomb();
      else fire();
    };

    // ── input: everything is swallowed so the app underneath never sees it ───────
    const setW = (w) => { weaponNow = w; setWeapon(w); };
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;           // leave browser shortcuts alone
      e.preventDefault();
      e.stopImmediatePropagation();
      const k = e.key.toLowerCase();
      if (k === "escape") { onExit(); return; }
      if (k === "1") setW("blaster");
      if (k === "2") setW("hammer");
      if (k === "3") setW("bomb");
      if (k === "e") swingHammer();
      if (k === "b") throwBomb();
      if ((k === " " || k === "w" || k === "arrowup") && !e.repeat && player.jumps < 2) {
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
      player.vy += GRAVITY * dt;
      const prevY = player.y;
      player.x = Math.max(8, Math.min(W - 8, player.x + player.vx * dt));
      player.y += player.vy * dt;
      player.onGround = false;
      if (player.vy >= 0 && t > player.dropUntil) {
        for (const p of standable) {
          if (player.x >= p.left && player.x <= p.right && prevY <= p.top + 1 && player.y >= p.top) {
            player.y = p.top; player.vy = 0; player.onGround = true; break;
          }
        }
      }
      if (player.y >= H - 2) { player.y = H - 2; player.vy = 0; player.onGround = true; }
      if (player.onGround) player.jumps = 0;
      // Standing on something that just got smashed: fall.
      player.phase += (player.vx && player.onGround ? 14 : 0) * dt;

      // weapons
      fireCd -= dt;
      if (mouse.down && weaponNow === "blaster" && fireCd <= 0) { fire(); fireCd = FIRE_EVERY; }

      bullets = bullets.filter((b) => {
        const steps = 4;
        for (let i = 0; i < steps; i++) {
          b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
          const el = pickTarget(b.x, b.y);
          if (el && hit(el, 1, b.x, b.y)) return false;
        }
        b.life -= dt;
        return b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20;
      });

      bombs = bombs.filter((b) => {
        b.vy += GRAVITY * 0.8 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.fuse -= dt;
        const landed = b.y >= H - 4 || standable.some((p) => b.x >= p.left && b.x <= p.right && Math.abs(b.y - p.top) < 6 && b.vy > 0);
        if (b.fuse <= 0 || landed) {
          blastArea(b.x, b.y, 95, 3);
          spawnSparks(b.x, b.y, "#ef4444", 24);
          spawnSparks(b.x, b.y, "#f59e0b", 24);
          return false;
        }
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

      // draw
      ctx.clearRect(0, 0, W, H);
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

      ctx.fillStyle = "#f59e0b";
      for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
      for (const b of bombs) {
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = Math.sin(t * 30) > 0 ? "#ef4444" : "#f59e0b";
        ctx.fillRect(b.x - 1.5, b.y - 12, 3, 5);
      }

      drawStickman(ctx, player, mouse, weaponNow, swings[0], ink);

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
          {[["blaster", "1 Blaster"], ["hammer", "2 Hammer"], ["bomb", "3 Bomb"]].map(([k, label]) => (
            <span key={k} className={`rounded px-1.5 py-0.5 border ${weapon === k ? "border-stone-800 bg-stone-900 text-stone-50" : "border-stone-200"}`}>{label}</span>
          ))}
        </span>
        <span className="text-stone-500 hidden md:inline">A/D move · W jump (twice) · S drop · click to use · E hammer · B bomb</span>
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
  } else if (weapon === "bomb") {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = "#C0512F"; ctx.fillRect(0, -3, 14, 6);
    ctx.fillStyle = ink; ctx.fillRect(2, 2, 4, 5);
  }
  ctx.restore();
}
