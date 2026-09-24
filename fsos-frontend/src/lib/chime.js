// The sound that says something landed on your plate.
//
// Synthesised rather than a file: no asset to load, no request to fail, and it can't be
// blocked by an ad filter the way a .mp3 from a CDN sometimes is. Two notes, a rising
// fifth, short — enough to notice across a room without being the kind of noise people
// mute on day two.
//
// Browsers won't let a page make sound until someone has interacted with it, which is
// the right rule; an audio context created on load starts "suspended". So we make it on
// the first click or keypress, by which point anyone using FSOS has certainly clicked
// something.

let ctx = null;
let armed = false;

function ensureContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch (e) {
    return null;                      // no audio on this device; silence is fine
  }
  return ctx;
}

/** Call once at startup. Creates the audio context on the first real interaction. */
export function armChime() {
  if (armed) return;
  armed = true;
  const wake = () => {
    const c = ensureContext();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", wake, { once: true });
  window.addEventListener("keydown", wake, { once: true });
}

/** Two rising notes. Does nothing if the browser hasn't allowed sound yet. */
export function chime() {
  const c = ensureContext();
  if (!c || c.state !== "running") return;

  const now = c.currentTime;
  // A major-ish rise: nobody hears this as an alarm, which matters when it fires all day.
  [[880, 0], [1318.5, 0.11]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + offset);

    // Quick attack, short decay. A square envelope would click.
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.17, now + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.26);

    osc.connect(gain).connect(c.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.3);
  });
}
