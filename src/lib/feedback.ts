"use client";

// Tasteful, dependency-free trade feedback: a confetti burst + a bright chord
// on a win, a short low tone on a loss. All best-effort — never throws, and a
// muted flag (localStorage "st_sound=off") silences audio.

function soundOn(): boolean {
  try {
    return localStorage.getItem("st_sound") !== "off";
  } catch {
    return true;
  }
}

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.14, type: OscillatorType = "sine") {
  const ac = ctx();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ac.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* ignore */
  }
}

export function playWinSound() {
  if (!soundOn()) return;
  // Rising major arpeggio.
  tone(523.25, 0, 0.18); // C5
  tone(659.25, 0.09, 0.18); // E5
  tone(783.99, 0.18, 0.28); // G5
}

export function playLoseSound() {
  if (!soundOn()) return;
  tone(196, 0, 0.28, 0.1, "triangle"); // low G3 thud
}

const COLORS = ["#6A47F5", "#9E86FF", "#00E39A", "#5B8DEF", "#FFB020", "#FF4D6D"];

export function confettiBurst() {
  if (typeof document === "undefined") return;
  try {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:70;";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    document.body.appendChild(canvas);
    const g = canvas.getContext("2d");
    if (!g) {
      canvas.remove();
      return;
    }
    g.scale(dpr, dpr);
    const W = window.innerWidth;
    const H = window.innerHeight;

    const N = Math.min(160, Math.floor(W / 6));
    const parts = Array.from({ length: N }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.5,
      y: H * 0.32 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * -12 - 4,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0,
    }));

    const GRAV = 0.32;
    const MAX = 150; // ~2.5s
    let frame = 0;

    function draw() {
      frame++;
      g!.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += GRAV;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.rot += p.vr;
        p.life++;
        const alpha = Math.max(0, 1 - frame / MAX);
        g!.save();
        g!.translate(p.x, p.y);
        g!.rotate(p.rot);
        g!.globalAlpha = alpha;
        g!.fillStyle = p.color;
        g!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        g!.restore();
      }
      if (frame < MAX) {
        requestAnimationFrame(draw);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(draw);
  } catch {
    /* ignore */
  }
}

export function celebrateWin() {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) confettiBurst();
  playWinSound();
}

export function signalLoss() {
  playLoseSound();
}
