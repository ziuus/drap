# Specification: Ultra-Realistic Liquid Glass Water Ripple Engine for Desktop

**Date**: 2026-11-05  
**Topic**: Desktop Liquid Glass & Physical Water Ripple Simulation  
**Status**: Approved by User  
**Target File(s)**: `overlay.py`, `server.py`, `drap` (CLI), `~/.config/drap/config.json`

---

## 1. Objective & Problem Statement
When a user sends an image or file from their phone to their Linux desktop, the previous visual feedback used standard radial gradients. An earlier experiment attempted a wobbly cartoonish wave wash which lacked physical realism. 

The user requested an **ultra-realistic liquid glass / clear water ripple effect** that looks like actual clear water sitting on the screen glass with physical surface tension and light refraction, while keeping it **disabled by default** with a toggle so that modest hardware incurs zero performance penalty.

---

## 2. Visual Optics & Fluid Dynamics Model

### 2.1 Crystalline Water Meniscus Body
- **Optics**: Clear water is transparent with light-focusing properties. The fluid body is rendered using a translucent ice-water crystalline refraction tint (`rgba(160, 230, 255, 0.12)` to `rgba(56, 189, 248, 0.18)`), allowing desktop windows and wallpaper to remain visible underneath while giving physical substance to the fluid volume.
- **Meniscus Curvature**: The water ridge forms a convex lens profile that curves upwards to the crest and drops off at the trough.

### 2.2 Specular Crest Highlights (Directional Ambient Lighting)
- **Virtual Light Vector**: Fixed ambient overhead light vector $(-0.6, -0.8)$ simulating overhead/room illumination.
- **Specular Glint**: Where the outward propagating ripple normal aligns with the ambient light vector, a sharp specular highlight (`rgba(255, 255, 255, 0.90)`) is drawn along the crest, with Fresnel angle falloff around the curve.
- **Caustic Contact Shadow**: Directly beneath each wave crest, an inverted soft shadow (`rgba(0, 0, 0, 0.28)`) is rendered along the wave base, creating genuine 3D visual depth that lifts the water off the display surface.

### 2.3 Harmonic Multi-Wave Dispersion
- **Primary Wave Front**: Main impact wave radiating outwards from the contact edge.
- **Secondary Harmonic Wake**: A micro-ripple trailing 45px behind with a softer reflection profile.
- **Surface Tension Damping**: Attenuation follows exponential-decay physics:
  $$\text{damping} = (1 - t)^{1.6} \cdot e^{-1.5 t}$$
  ensuring all ripples naturally settle into flat glass clarity within 1.1s.

### 2.4 Edge Droplet Beads
- Tiny micro-droplet beads shimmer along the entry point of the bezel where the file breached the desktop edge, fading smoothly as surface tension reabsorbs them.

---

## 3. Configuration & CLI Toggle System

### 3.1 Persistent Configuration (`~/.config/drap/config.json`)
The configuration is saved in user config directory:
```json
{
  "liquid_glass": false,
  "theme": "aurora"
}
```
- **Default State**: `liquid_glass` defaults to `false`.
- When `liquid_glass` is `false`: Drap uses the lightweight clean confirmation card with 0% shader/wave overhead.
- When `liquid_glass` is `true`: The ultra-realistic liquid water ripple renders on file/photo drop arrival.

### 3.2 CLI Commands (`drap`)
- `drap config liquid_glass on`: Sets `liquid_glass` to `true` in config and signals running overlay.
- `drap config liquid_glass off`: Sets `liquid_glass` to `false` in config.
- `drap status`: Displays active configuration:
  ```text
  💧 Liquid Glass Water FX: [Enabled / Disabled] (Default: Disabled)
  ```

### 3.3 Dynamic Runtime Sync
- When modified via CLI, the CLI writes to `~/.config/drap/config.json` and notifies `overlay.py` via local IPC / reload so changes take effect immediately without requiring a full restart.

---

## 4. Architecture & Rendering Implementation

### 4.1 GTK4 Layer Shell Drawing Pipeline (`overlay.py`)
- Inside `overlay.py`:
  - `self.liquid_glass_enabled`: Boolean flag loaded from `config.json`.
  - In `_draw_fullscreen_confirm_wave(self, cr, width, height, progress)`:
    - If `self.liquid_glass_enabled` is `False`: Early exit or render minimal lightweight ambient glow.
    - If `self.liquid_glass_enabled` is `True`: Render the multi-layer liquid water meniscus, directional specular crests, caustic shadows, and harmonic wakes.
- Dynamic origin support:
  - Supports all 4 bezels (`left`, `right`, `top`, `bottom`) and 4 corners (`corner-top-left`, etc.).

### 4.2 Performance & Resource Safeguards
- **Framerate Target**: Locked 60–144 FPS composited via Wayland layer shell.
- **Idle CPU**: Exactly **0.00%**. The GTK tick callback (`self.drawing_area.add_tick_callback`) is only active during the 1.1s duration of the drop confirmation and unhooks immediately upon completion.

---

## 5. Verification & Testing Plan
1. **Config Verification**:
   - Verify `drap config liquid_glass on` writes to `~/.config/drap/config.json`.
   - Verify `drap status` shows the correct state.
2. **Visual & Performance Verification**:
   - Test drop wave rendering with `liquid_glass` disabled: verify no lag, 0% CPU.
   - Test drop wave rendering with `liquid_glass` enabled: verify liquid glass water meniscus, specular crest highlights, caustic shadows, and smooth 60+ FPS playback.
   - Test all 4 screen edges (`left`, `right`, `top`, `bottom`) and corner drops.
3. **Daemon & Package Sync**:
   - Verify syntax with `python3 -m py_compile overlay.py server.py`.
   - Update `/home/zius/.local/share/drap` and restart via `drap restart`.
