# tools/reel — offline renderer + reel builder

The promo reel is rendered **from the add-on that ships**, not from mock-ups:
`export_scene.py` reads the published `.zip`, parses the GLB models and PNG PBR maps,
and writes one `.psc` bundle; `render.c` rasterises it with a small forward PBR
pipeline; `make_reel.py` upscales to 1080×1920, composites Persian/English titles and
muxes a synthesised soundtrack.

```
render.c        # z-buffer rasteriser: GGX specular, 3-light rig, equirect IBL,
                # shadow map, normal mapping, ACES tonemap, bloom, grain, CA, vignette
export_scene.py # .zip → .psc bundle (models via glb_read.py, textures via Pillow)
glb_read.py     # GLB → flat arrays (also validates the shipped models)
make_reel.py    # shot list, titles (Vazirmatn + arabic-reshaper/bidi), ffmpeg mux
make_audio.py   # 100 BPM A-minor bed: kick, sub, hats, pad, arp, risers on cuts
fonts/          # Vazirmatn (SIL OFL 1.1, see OFL-Vazirmatn.txt)
```

Reproduce:

```bash
pip install numpy pillow imageio-ffmpeg arabic-reshaper python-bidi
gcc -O2 -o render render.c -lm
python3 export_scene.py --zip ../../addons/ultra-pack/dist/phantom-ultra-v1.0.0.zip \
        --out /tmp/bundle.psc --tex-size 1024
python3 make_reel.py --bundle /tmp/bundle.psc --out out/phantom-ultra-reel.mp4 --jobs 2
```

Render cost on 2 vCPUs: ~10 minutes for 8 shots / 582 frames at 720×1280 internal
resolution, upscaled to 1080×1920 (Lanczos) with grain so the upscale is invisible.
