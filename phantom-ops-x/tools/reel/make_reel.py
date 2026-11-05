#!/usr/bin/env python3
"""Render the PHANTOM OPS X — Ultra Pack vertical reel (1080x1920, 30 fps).

Pipeline: tools/reel/render.c rasterises the *shipped* Ultra Pack geometry and
textures offline → this script upscales, grades, composites Persian/English
titles (Vazirmatn + arabic-reshaper/bidi) and muxes a procedurally synthesised
soundtrack.

    python3 make_reel.py --bundle /tmp/reel/bundle.psc --out out/phantom-ultra-reel.mp4
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, 'fonts')
FPS = 30
OUT_W, OUT_H = 1080, 1920
REN_W, REN_H = 720, 1280
REPO = 'github.com/amingangmanatgh2-hash/gaming-hub'

FA = 'Vazirmatn-Black.ttf'
FA_BOLD = 'Vazirmatn-Bold.ttf'
FA_MED = 'Vazirmatn-Medium.ttf'


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def fa(text):
    """Shape Persian for PIL (no built-in complex-text shaping)."""
    return get_display(arabic_reshaper.reshape(text))


SHOTS = [
    dict(shot=0, seconds=3.0, kicker='PHANTOM OPS X',
         fa='پک گرافیک اولترا', en='ULTRA GRAPHICS PACK',
         sub='۳۴٬۸۹۸ مثلث · ۲۷ میلیون پیکسل',
         tag='01 · hero carbine'),
    dict(shot=1, seconds=2.4, kicker='3D MODELS',
         fa='شش مدل سه‌بعدی واقعی', en='6 authored models',
         sub='کارابین · اپراتور · برج · جعبه · پهپاد',
         tag='02 · turntable'),
    dict(shot=2, seconds=2.0, kicker='PBR TEXTURES',
         fa='بافت‌های فیزیکی، پیکسل به پیکسل', en='albedo · normal · metal-rough · emissive',
         sub='همه با کد ساخته شده — نه عکس، نه اسکن',
         tag='03 · macro'),
    dict(shot=3, seconds=2.4, kicker='OPERATOR RIG',
         fa='اپراتور زره‌پوش', en='armoured operator',
         sub='۱۳٬۱۱۸ مثلث · پنل، کامو، شیشه، نئون',
         tag='04 · reveal'),
    dict(shot=4, seconds=2.0, kicker='MUZZLE FX',
         fa='شلیک، جرقه، نور', en='recoil · flash · sparks',
         sub='ریکویل · فلش · جرقه',
         tag='05 · firing'),
    dict(shot=6, seconds=1.8, kicker='MATERIALS',
         fa='نورپردازی واقعی', en='ACES · PMREM env · soft shadows',
         sub='محیط نئونی = نور محیطی',
         tag='06 · lighting'),
    dict(shot=5, seconds=2.6, kicker='MAP PROPS',
         fa='پراپ‌های سه‌بعدی در مپ', en='pylons · crates · drones',
         sub='از پک می‌آیند، با یک کلیک حذف می‌شوند',
         tag='07 · world'),
    dict(shot=7, seconds=3.2, kicker='GET THE ADD-ON',
         fa='بازی پایه سبک، گرافیک الترا با یک دانلود', en='optional · 18 MB · SHA-256 verified',
         sub='', tag='08 · finale', cta=True),
]

TOTAL_FRAMES = sum(int(s['seconds'] * FPS) for s in SHOTS)
XFADE = 10  # frames


# ---------------------------------------------------------------- helpers
def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def ffmpeg_bin():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = shutil.which('ffmpeg')
        if not exe:
            raise SystemExit('ffmpeg not available (pip install imageio-ffmpeg)')
        return exe


def glow_text(base, xy, text, fnt, fill, anchor='ls', glow=18, glow_alpha=150, spacing=0):
    """Draw text with a soft neon halo onto an RGBA layer."""
    halo = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(halo)
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor, spacing=spacing)
    halo = halo.filter(ImageFilter.GaussianBlur(glow))
    if glow_alpha < 255:
        alpha = halo.split()[3].point(lambda a: int(a * glow_alpha / 255))
        halo.putalpha(alpha)
    base.alpha_composite(halo)
    ImageDraw.Draw(base).text(xy, text, font=fnt, fill=fill, anchor=anchor, spacing=spacing)


def wrap_fa(draw, text, fnt, max_width):
    words = text.split(' ')
    lines, cur = [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if draw.textlength(trial, font=fnt) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def text_layer(spec, index):
    """Static text for a shot, rendered once (laid out bottom-up, reel-safe)."""
    layer = Image.new('RGBA', (OUT_W, OUT_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    margin = 84

    # top kicker
    f_kick = font(FA_BOLD, 40)
    d.rectangle([margin, 168, margin + 8, 208], fill=(34, 211, 238, 255))
    d.text((margin + 24, 208), spec['kicker'], font=f_kick, fill=(190, 245, 255, 235), anchor='ls')
    d.text((OUT_W - margin, 208), f"{index + 1:02d} / {len(SHOTS):02d}", font=font(FA_MED, 34),
           fill=(120, 150, 170, 220), anchor='rs')

    f_head = font(FA, 86 if not spec.get('cta') else 74)
    f_en = font(FA_BOLD, 44)
    f_sub = font(FA_MED, 38)
    head_lh, sub_lh, en_lh = 98, 50, 62

    head_lines = wrap_fa(d, fa(spec['fa']), f_head, OUT_W - margin * 2)[:2]
    sub_lines = wrap_fa(d, fa(spec['sub']), f_sub, OUT_W - margin * 2)[:2] if spec.get('sub') else []
    # build the block from the bottom edge upward (keeps Reels UI clear)
    bottom = OUT_H - 250
    if spec.get('cta'):
        bottom = OUT_H - 372
    for i, line in enumerate(sub_lines):                       # subtitles first (lowest)
        d.text((OUT_W - margin, bottom - (len(sub_lines) - 1 - i) * sub_lh), line, font=f_sub,
               fill=(186, 206, 220, 240), anchor='rs')
    en_baseline = bottom - len(sub_lines) * sub_lh - 16
    glow_text(layer, (OUT_W - margin, en_baseline), spec['en'], f_en, (34, 211, 238, 255),
              anchor='rs', glow=16, glow_alpha=90)
    head_bottom = en_baseline - 98
    for i, line in enumerate(head_lines):
        baseline = head_bottom - (len(head_lines) - 1 - i) * head_lh
        glow_text(layer, (OUT_W - margin, baseline), line, f_head,
                  (255, 255, 255, 255), anchor='rs', glow=22, glow_alpha=120)

    # bottom tag row
    d.text((margin, OUT_H - 150), spec['tag'], font=font(FA_BOLD, 30),
           fill=(120, 150, 170, 210), anchor='ls')
    d.text((OUT_W - margin, OUT_H - 150), '◆ ULTRA PACK v1.0', font=font(FA_BOLD, 30),
           fill=(140, 230, 255, 215), anchor='rs')

    if spec.get('cta'):
        f_cta = font(FA_BOLD, 40)
        box_top = OUT_H - 306
        d.rounded_rectangle([margin, box_top, OUT_W - margin, box_top + 100], radius=26,
                            fill=(10, 24, 34, 215), outline=(34, 211, 238, 170), width=3)
        d.text((OUT_W // 2, box_top + 50), REPO, font=f_cta, fill=(190, 245, 255, 255), anchor='mm')
    return layer


_SC_TOP, _SC_BOTTOM = OUT_H - 760, OUT_H


def _scrim():
    """Cached vertical darkening behind the lower third (keeps titles readable)."""
    global _SCRIM
    if '_SCRIM' in globals():
        return _SCRIM
    ramp = np.zeros((OUT_H, OUT_W, 3), np.float32)
    h = _SC_BOTTOM - _SC_TOP
    grad = (np.linspace(0, 1, h, dtype=np.float32) ** 1.7) * 0.62
    ramp[_SC_TOP:_SC_BOTTOM, :, :] = grad[:, None, None]
    _SCRIM = ramp
    return _SCRIM


def _vignette():
    global _VIG
    if '_VIG' in globals():
        return _VIG
    yy, xx = np.mgrid[0:OUT_H, 0:OUT_W].astype(np.float32)
    r = np.sqrt(((xx / OUT_W) - 0.5) ** 2 + ((yy / OUT_H) - 0.5) ** 2)
    _VIG = (1.0 - np.clip((r - 0.30) * 0.55, 0, 0.30))[..., None]
    return _VIG


def compose_frame(frame_rgb, spec, layer, local_t, duration, index):
    """Upscale, grade, animate the text layer, return a 1080x1920 RGB frame."""
    img = Image.fromarray(frame_rgb).resize((OUT_W, OUT_H), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32) / 255.0
    # grade: gentle S-curve + cool shadows + slight chroma lift
    arr = np.clip(arr, 0, 1)
    arr = arr * arr * (3 - 2 * arr) * 0.35 + arr * 0.65
    shadow_tint = np.array([0.03, 0.06, 0.11], np.float32)
    lum = arr.mean(axis=2, keepdims=True)
    arr = arr + (1 - lum) * shadow_tint * 0.55
    # vignette + lower-third scrim so titles never fight the image
    arr *= _vignette()
    arr = arr * (1.0 - _scrim()) + _scrim() * 0.02
    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))

    # text animation: fade + 40 px rise over the first 0.5 s, fade out at the end
    appear = min(1.0, local_t / 0.45)
    vanish = min(1.0, max(0.0, (duration - local_t) / 0.30))
    alpha = int(255 * min(appear, vanish) ** 0.85)
    if alpha <= 2:
        return img
    shifted = Image.new('RGBA', (OUT_W, OUT_H), (0, 0, 0, 0))
    offset = int((1 - appear) * 46)
    shifted.alpha_composite(layer.crop((0, 0, OUT_W, OUT_H - offset)), (0, offset))
    a = shifted.split()[3].point(lambda v: int(v * alpha / 255))
    shifted.putalpha(a)
    base = img.convert('RGBA')
    base.alpha_composite(shifted)
    return base.convert('RGB')


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bundle', default='/tmp/reel/bundle.psc')
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'phantom-ultra-reel.mp4'))
    ap.add_argument('--bin', default=os.path.join(HERE, 'render'))
    ap.add_argument('--slots', default='0,1,2,3,4,5')
    ap.add_argument('--jobs', type=int, default=2)
    ap.add_argument('--skip-shots', action='store_true')
    args = ap.parse_args()

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='reel-')
    ffmpeg = ffmpeg_bin()
    print(f'▶ renderer: {args.bin}\n▶ fps {FPS} · {OUT_W}x{OUT_H} · {TOTAL_FRAMES} frames')

    # 1. render each shot (in parallel) and encode to an intermediate mp4
    tasks = []
    for i, spec in enumerate(SHOTS):
        frames = int(spec['seconds'] * FPS)
        raw = os.path.join(tmp, f'shot{i}.raw')
        mp4 = os.path.join(tmp, f'shot{i}.mp4')
        tasks.append((i, spec, frames, raw, mp4))

    def render_one(task):
        i, spec, frames, raw, mp4 = task
        run([args.bin, args.bundle, str(spec['shot']), '0', str(frames),
             str(REN_W), str(REN_H), raw, args.slots])
        run([ffmpeg, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
             '-s', f'{REN_W}x{REN_H}', '-r', str(FPS), '-i', raw,
             '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', mp4])
        os.unlink(raw)
        return i

    if not args.skip_shots:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
            for i in pool.map(render_one, tasks):
                print(f'  shot {i} rendered')

    # 2. text layers
    layers = [text_layer(spec, i) for i, spec in enumerate(SHOTS)]

    # 3. assemble + encode
    duration = TOTAL_FRAMES / FPS
    cuts = []
    acc = 0.0
    for spec in SHOTS[:-1]:
        acc += spec['seconds']
        cuts.append(round(acc, 3))
    audio_path = os.path.join(tmp, 'audio.wav')
    run([sys.executable, os.path.join(HERE, 'make_audio.py'), audio_path, f'{duration:.3f}',
         ','.join(str(c) for c in cuts)])
    print(f'  audio {duration:.2f}s')

    final_raw = os.path.join(tmp, 'final.mp4')
    enc = subprocess.Popen([
        ffmpeg, '-y', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OUT_W}x{OUT_H}', '-r', str(FPS), '-i', '-',
        '-i', audio_path,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-profile:v', 'high', '-movflags', '+faststart',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', final_raw,
    ], stdin=subprocess.PIPE)

    prev_tail = []
    frame_no = 0
    for i, (spec, layer) in enumerate(zip(SHOTS, layers)):
        mp4 = os.path.join(tmp, f'shot{i}.mp4')
        frames = int(spec['seconds'] * FPS)
        dec = subprocess.Popen([ffmpeg, '-loglevel', 'error', '-i', mp4,
                                '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                               stdout=subprocess.PIPE)
        shot_frames = []
        size = REN_W * REN_H * 3
        for _ in range(frames):
            buf = dec.stdout.read(size)
            if len(buf) < size:
                break
            shot_frames.append(np.frombuffer(buf, np.uint8).reshape(REN_H, REN_W, 3))
        dec.stdout.close()
        dec.wait()

        for k, fr in enumerate(shot_frames):
            local_t = k / FPS
            img = compose_frame(fr, spec, layer, local_t, spec['seconds'], i)
            if k < XFADE and prev_tail:
                w = (k + 1) / (XFADE + 1)
                mix = Image.blend(prev_tail[k], img, w)
            else:
                mix = img
            enc.stdin.write(mix.tobytes())
            frame_no += 1
        prev_tail = [compose_frame(fr, spec, layer, (len(shot_frames) - 1) / FPS,
                                   spec['seconds'], i) for fr in shot_frames[-XFADE:]]
        print(f'  shot {i} composited ({len(shot_frames)} frames)')

    enc.stdin.close()
    enc.wait()
    shutil.move(final_raw, args.out)
    shutil.rmtree(tmp, ignore_errors=True)
    size_mb = os.path.getsize(args.out) / (1024 * 1024)
    print(f'✔ {args.out}  {frame_no} frames · {frame_no / FPS:.1f}s · {size_mb:.1f} MB')


if __name__ == '__main__':
    main()
