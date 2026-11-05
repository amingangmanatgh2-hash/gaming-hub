#!/usr/bin/env python3
"""Procedural soundtrack for the reel — synthesised from scratch with numpy.

100 BPM, A-minor, side-chained pad, sub bass, four-on-the-floor kick, hats and a
noise riser on every cut. No samples, no licensing questions.
"""
from __future__ import annotations

import struct
import sys
import wave

import numpy as np

SR = 44100


def env(n, attack=0.005, decay=0.25, curve=3.0):
    a = int(SR * attack)
    d = max(1, n - a)
    e = np.concatenate([np.linspace(0, 1, a, endpoint=False),
                        np.exp(-curve * np.linspace(0, 1, d))])
    return e[:n]


def kick(dur=0.35, punch=110.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    freq = punch * np.exp(-18 * t) + 45
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-6.5 * t)
    click = np.exp(-120 * t) * 0.4
    return (body + click).astype(np.float32)


def hat(dur=0.06, tone=0.9):
    n = int(SR * dur)
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n).astype(np.float32)
    noise = np.diff(np.concatenate([[0.0], noise])).astype(np.float32)  # crude high-pass
    return (noise * np.exp(-70 * np.arange(n) / SR) * tone).astype(np.float32)


def snare(dur=0.22):
    n = int(SR * dur)
    rng = np.random.default_rng(11)
    noise = rng.standard_normal(n).astype(np.float32) * np.exp(-24 * np.arange(n) / SR)
    tone = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * np.exp(-30 * np.arange(n) / SR) * 0.6
    return (noise * 0.7 + tone).astype(np.float32)


def saw(freq, dur, detune=0.004, voices=3):
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    for v in range(voices):
        f = freq * (1 + detune * (v - (voices - 1) / 2))
        out += ((2 * (t * f % 1.0)) - 1).astype(np.float32)
    return out / voices


def lowpass(x, cutoff):
    """One-pole low-pass (cutoff in Hz)."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def rumbling_riser(dur):
    n = int(SR * dur)
    rng = np.random.default_rng(3)
    noise = rng.standard_normal(n).astype(np.float32)
    t = np.linspace(0, 1, n, dtype=np.float32)
    shaped = noise * (t ** 2.2)
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(80, 900, n)) / SR).astype(np.float32) * (t ** 3) * 0.35
    return (shaped * 0.5 + sweep)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else 'reel_audio.wav'
    duration = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    cuts = [float(x) for x in (sys.argv[3].split(',') if len(sys.argv) > 3 else [])]

    bpm = 100.0
    beat = 60.0 / bpm
    total = int(SR * duration)
    music = np.zeros((total, 2), np.float32)

    def add(sig, at_sec, gain=1.0, pan=0.0):
        start = int(at_sec * SR)
        end = min(total, start + len(sig))
        if start >= total or end <= start:
            return
        chunk = sig[:end - start] * gain
        left = np.sqrt(0.5 * (1 - pan))
        right = np.sqrt(0.5 * (1 + pan))
        music[start:end, 0] += chunk * left
        music[start:end, 1] += chunk * right

    kick_s = kick()
    hat_s = hat()
    snare_s = snare()

    # A minor progression, one chord per bar
    roots = [55.0, 65.41, 49.0, 58.27]          # A1, C2, G1, Bb1
    chords = [[220.0, 261.63, 329.63],          # Am
              [261.63, 329.63, 392.0],          # C
              [196.0, 246.94, 293.66],          # G
              [233.08, 293.66, 349.23]]         # Bb

    bars = int(np.ceil(duration / (beat * 4))) + 1
    for bar in range(bars):
        t0 = bar * beat * 4
        root = roots[bar % len(roots)]
        chord = chords[bar % len(chords)]
        # kick + sub on every beat
        for b in range(4):
            add(kick_s, t0 + b * beat, 0.85)
            add(saw(root, beat * 0.9, voices=1) * env(int(SR * beat * 0.9), 0.01, 0.3, 5), t0 + b * beat, 0.30)
        # hats on 8ths, snare on 2 & 4
        for e in range(8):
            add(hat_s, t0 + e * beat / 2, 0.16 if e % 2 else 0.10, pan=0.25)
        add(snare_s, t0 + beat, 0.28, pan=-0.1)
        add(snare_s, t0 + 3 * beat, 0.30, pan=-0.1)
        # pad chord, slow attack
        for f in chord:
            pad = lowpass(saw(f, beat * 3.9), 1600) * env(int(SR * beat * 3.9), 0.18, 0.6, 1.6)
            add(pad, t0, 0.10, pan=0.15)
        # arpeggio sixteenths, bright and rising through the reel
        for s in range(8):
            f = chord[s % len(chord)] * (2 if s >= 4 else 1)
            arp = saw(f, beat * 0.22, voices=2) * env(int(SR * beat * 0.22), 0.002, 0.2, 6)
            add(lowpass(arp, 4200), t0 + s * beat / 2, 0.075, pan=-0.25)

    # side-chain the pads against the kick by ducking the whole mix on beats
    duck = np.ones(total, np.float32)
    for b in range(int(duration / beat) + 1):
        s = int(b * beat * SR)
        n = min(int(0.18 * SR), max(0, total - s))
        if n > 0:
            duck[s:s + n] *= np.linspace(0.55, 1.0, n) ** 0.8
    music *= duck[:, None]

    # risers on the cuts
    for c in cuts:
        add(rumbling_riser(0.5), max(0.0, c - 0.5), 0.42, pan=0.0)

    # master: gentle saturation, fade in/out, normalise
    music = np.tanh(music * 1.6) * 0.85
    fade = int(0.25 * SR)
    music[:fade] *= np.linspace(0, 1, fade)[:, None]
    music[-fade:] *= np.linspace(1, 0, fade)[:, None]
    peak = float(np.max(np.abs(music))) or 1.0
    music = (music / peak) * 0.92
    pcm = (music * 32767.0).astype('<i2')
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())
    print(f'✔ {out_path}  {duration:.1f}s  peak {peak:.2f}')


if __name__ == '__main__':
    main()
