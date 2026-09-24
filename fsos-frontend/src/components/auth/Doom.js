// Something to do while the wifi is out.
//
// A small raycaster, the Wolfenstein/Doom trick: for every column of the screen, walk a
// ray out from the eye until it hits a wall, and draw a vertical bar whose height is the
// inverse of how far it went. Nearer wall, taller bar. Do that eighty times and you have
// a 3D view made of text.
//
// It renders into a <pre>, so the "pixels" are characters and the shading is ░▒▓█ by
// distance. Enemies are billboards: flat sprites always facing you, drawn after the walls
// and hidden behind them using the per-column depths the wall pass already worked out.
//
// It only exists on the "can't reach the server" screen and it only runs when someone
// asks for it, so it costs nothing until a person is genuinely stuck waiting.
import React, { useCallback, useEffect, useRef, useState } from "react";

const W = 80;
const H = 26;
const FOV = 0.66;

// # is wall, space is floor. Small enough to learn in one sitting.
const MAP = [
  "################",
  "#..............#",
  "#..##......##..#",
  "#..##......##..#",
  "#..............#",
  "#....######....#",
  "#....#....#....#",
  "#....#....#....#",
  "#..............#",
  "#..##......##..#",
  "#..##......##..#",
  "#..............#",
  "################",
];
const MAP_W = MAP[0].length;
const MAP_H = MAP.length;
const solid = (x, y) =>
  x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || MAP[Math.floor(y)][Math.floor(x)] === "#";

// Nearest to furthest. The last one is what distance fades into.
const SHADE = ["█", "▓", "▒", "░", "·"];
const SHADE_DARK = ["▓", "▒", "░", "·", " "];   // walls you see edge-on, one step dimmer

// Five rows, scaled up or down by how near the thing is.
const IMP = [
  " ▄██▄ ",
  "▟████▙",
  "█▀██▀█",
  "▜████▛",
  " ▀▐▌▀ ",
];

const SPAWNS = [[2.5, 2.5], [13.5, 2.5], [2.5, 10.5], [13.5, 10.5], [8.5, 6.5]];

function freshState() {
  return {
    px: 7.5, py: 10.5,          // the open strip along the bottom
    dx: 0, dy: -1,              // facing north
    plane: FOV,
    imps: SPAWNS.map(([x, y]) => ({ x, y, alive: true })),
    health: 100,
    ammo: 50,
    kills: 0,
    wave: 1,
    flash: 0,
    dead: false,
    keys: new Set(),
  };
}

export default function Doom({ onExit }) {
  const [frame, setFrame] = useState("");
  const [hud, setHud] = useState({ health: 100, ammo: 50, kills: 0, wave: 1, dead: false });
  const g = useRef(freshState());
  const box = useRef(null);

  const shoot = useCallback(() => {
    const s = g.current;
    if (s.dead || s.ammo <= 0) return;
    s.ammo -= 1;
    s.flash = 2;
    // Hits whatever is nearest the middle of the view, within range and roughly ahead.
    let best = null;
    for (const imp of s.imps) {
      if (!imp.alive) continue;
      const rx = imp.x - s.px;
      const ry = imp.y - s.py;
      const dist = Math.hypot(rx, ry);
      if (dist > 9) continue;
      // How far off-centre it is: the cross product against the facing direction.
      const off = Math.abs(rx * s.dy - ry * s.dx) / (dist || 1);
      const ahead = rx * s.dx + ry * s.dy;
      if (ahead <= 0 || off > 0.22) continue;
      if (!best || dist < best.dist) best = { imp, dist };
    }
    if (best) {
      best.imp.alive = false;
      s.kills += 1;
    }
  }, []);

  useEffect(() => {
    const s = g.current;
    const down = (e) => {
      const k = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (k === "escape") { onExit(); return; }
      if (k === "r" && s.dead) { g.current = freshState(); return; }
      if (k === " ") shoot();
      s.keys.add(k);
    };
    const up = (e) => s.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    box.current?.focus();
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [shoot, onExit]);

  useEffect(() => {
    let raf;
    let last = performance.now();

    const tick = (now) => {
      const s = g.current;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!s.dead) {
        const k = s.keys;
        const fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
        const turn = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
        const strafe = (k.has("e") ? 1 : 0) - (k.has("q") ? 1 : 0);

        if (turn) {
          const a = turn * 2.4 * dt;
          const cos = Math.cos(a), sin = Math.sin(a);
          const odx = s.dx;
          s.dx = s.dx * cos - s.dy * sin;
          s.dy = odx * sin + s.dy * cos;
        }
        // Axes separately, so brushing a wall slides along it instead of stopping dead.
        const step = 3.2 * dt;
        const nx = s.px + (s.dx * fwd - s.dy * strafe) * step;
        const ny = s.py + (s.dy * fwd + s.dx * strafe) * step;
        if (!solid(nx, s.py)) s.px = nx;
        if (!solid(s.px, ny)) s.py = ny;

        for (const imp of s.imps) {
          if (!imp.alive) continue;
          const rx = s.px - imp.x, ry = s.py - imp.y;
          const d = Math.hypot(rx, ry) || 1;
          if (d < 0.7) {
            s.health -= 28 * dt;
            if (s.health <= 0) { s.health = 0; s.dead = true; }
          } else {
            const mx = imp.x + (rx / d) * 1.05 * dt;
            const my = imp.y + (ry / d) * 1.05 * dt;
            if (!solid(mx, imp.y)) imp.x = mx;
            if (!solid(imp.x, my)) imp.y = my;
          }
        }
        if (s.imps.every((i) => !i.alive)) {
          s.wave += 1;
          s.ammo += 25;
          s.health = Math.min(100, s.health + 20);
          s.imps = SPAWNS.map(([x, y]) => ({ x, y, alive: true }));
        }
        if (s.flash > 0) s.flash -= 1;
      }

      // ── walls ───────────────────────────────────────────────────────────────
      const grid = Array.from({ length: H }, () => new Array(W).fill(" "));
      const depth = new Array(W).fill(Infinity);
      const planeX = -s.dy * s.plane;
      const planeY = s.dx * s.plane;

      for (let x = 0; x < W; x++) {
        const cam = (2 * x) / W - 1;
        const rdx = s.dx + planeX * cam;
        const rdy = s.dy + planeY * cam;
        let mx = Math.floor(s.px), my = Math.floor(s.py);
        const ddx = Math.abs(1 / (rdx || 1e-9));
        const ddy = Math.abs(1 / (rdy || 1e-9));
        let sx, sy, sideX, sideY;
        if (rdx < 0) { sx = -1; sideX = (s.px - mx) * ddx; } else { sx = 1; sideX = (mx + 1 - s.px) * ddx; }
        if (rdy < 0) { sy = -1; sideY = (s.py - my) * ddy; } else { sy = 1; sideY = (my + 1 - s.py) * ddy; }

        let side = 0;
        for (let guard = 0; guard < 64; guard++) {
          if (sideX < sideY) { sideX += ddx; mx += sx; side = 0; }
          else { sideY += ddy; my += sy; side = 1; }
          if (solid(mx, my)) break;
        }
        // Perpendicular distance, not the ray's own length — using the latter bows the
        // walls outward at the edges of the view.
        const dist = side === 0 ? sideX - ddx : sideY - ddy;
        depth[x] = dist;

        const lineH = Math.min(H, Math.floor(H / (dist || 0.0001)));
        const top = Math.floor((H - lineH) / 2);
        const shades = side === 1 ? SHADE_DARK : SHADE;
        const ch = shades[Math.min(shades.length - 1, Math.floor(dist / 2.2))];
        for (let y = 0; y < H; y++) {
          if (y < top) grid[y][x] = " ";
          else if (y < top + lineH) grid[y][x] = ch;
          else grid[y][x] = y > H - 4 ? "," : ".";      // floor thickens as it nears you
        }
      }

      // ── enemies ─────────────────────────────────────────────────────────────
      const inv = 1 / (planeX * s.dy - s.dx * planeY);
      const sorted = s.imps
        .filter((i) => i.alive)
        .map((i) => ({ i, d: (i.x - s.px) ** 2 + (i.y - s.py) ** 2 }))
        .sort((a, b) => b.d - a.d);

      for (const { i: imp } of sorted) {
        const rx = imp.x - s.px;
        const ry = imp.y - s.py;
        const tx = inv * (s.dy * rx - s.dx * ry);
        const ty = inv * (-planeY * rx + planeX * ry);   // depth into the screen
        if (ty <= 0.2) continue;

        const screenX = Math.floor((W / 2) * (1 + tx / ty));
        const sh = Math.min(H, Math.abs(Math.floor(H / ty)));
        const sw = Math.max(2, Math.floor(sh * 0.7));
        const top = Math.floor((H - sh) / 2);
        const left = screenX - Math.floor(sw / 2);

        for (let col = 0; col < sw; col++) {
          const x = left + col;
          if (x < 0 || x >= W || ty >= depth[x]) continue;   // behind a wall
          for (let row = 0; row < sh; row++) {
            const y = top + row;
            if (y < 0 || y >= H) continue;
            const bmY = Math.floor((row / sh) * IMP.length);
            const bmX = Math.floor((col / sw) * IMP[0].length);
            const c = IMP[bmY][bmX];
            if (c !== " ") grid[y][x] = c;
          }
        }
      }

      // Crosshair, and the muzzle lighting the room for a frame.
      const midY = Math.floor(H / 2);
      const midX = Math.floor(W / 2);
      grid[midY][midX] = "+";
      if (s.flash > 0) {
        for (let x = midX - 3; x <= midX + 3; x++) {
          if (x >= 0 && x < W && grid[midY - 1]) grid[midY - 1][x] = "*";
        }
      }

      setFrame(grid.map((r) => r.join("")).join("\n"));
      setHud({
        health: Math.ceil(s.health), ammo: s.ammo, kills: s.kills, wave: s.wave, dead: s.dead,
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const bar = (n) => "█".repeat(Math.round(n / 10)).padEnd(10, "░");

  return (
    <div
      ref={box}
      tabIndex={-1}
      className="mt-6 select-none outline-none"
      data-testid="doom"
      onClick={() => box.current?.focus()}
    >
      <pre
        className="mx-auto w-fit rounded-md bg-stone-950 px-3 py-2 text-[9px] leading-[9px] text-emerald-400 sm:text-[11px] sm:leading-[11px]"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      >
        {frame}
      </pre>
      <pre
        className="mx-auto mt-1 w-fit text-[10px] leading-4 text-stone-500 sm:text-[11px]"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      >
        {hud.dead
          ? `   YOU DIED   ·   kills ${hud.kills}   ·   press R to go again`
          : `HEALTH ${bar(hud.health)} ${String(hud.health).padStart(3)}   AMMO ${String(hud.ammo).padStart(3)}   KILLS ${String(hud.kills).padStart(3)}   WAVE ${hud.wave}`}
      </pre>
      <p className="mt-2 text-center text-[11px] text-stone-400">
        W A S D or arrows to move · Q E to strafe · space to shoot · Esc to leave
      </p>
    </div>
  );
}
