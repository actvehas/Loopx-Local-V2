# EP16 Confesiones — Remotion Assembly Design

## Overview

Assemble a ~95.8-minute video from 608 scenes (91 mp4 + 513 jpg), synced with narrated audio and karaoke-style subtitles. Renders on Hetzner (65.109.85.250) using Remotion 4.0.434.

## Input Assets

| Asset | Format | Size | Source |
|-------|--------|------|--------|
| 618 files (608 unique scenes + duplicates) | .mp4 (91) + .jpg (527) | ~795MB | `Cenas/` folder |
| Narrated audio | audio.wav | 263MB | Qwen3-TTS (MLX) |
| Subtitles | audio.srt | ~200KB | Whisper |
| Scene timing | cenas-minutagem.md | ~50KB | Whisper-derived |

### Deduplication Rule

The `Cenas/` folder contains 618 files but only 608 unique scenes. Files with `(1)` suffix (e.g., `(Cena_007)...(1).mp4`) are re-download duplicates. Rule: **for each scene number, prefer the file WITHOUT the `(1)` suffix. Ignore all `(1)` files.** Implemented in `parse-scenes.ts`.

## Output

- `final.mp4` — 1920x1080, 30fps, H264 CRF 18, AAC 192k, ~95.8 min
- Total frames: 172,440 (5748 seconds × 30fps)
- Estimated file size: ~2-4GB

## Architecture

Standalone Remotion project at `/root/loopx-local/remotion/` on Hetzner. Assets uploaded via rsync from Mac M3 to `/root/loopx-local/jobs/E/16/`.

### Composition Structure (3 layers)

```
┌─────────────────────────────────────────────┐
│  CinemaFilter (vignette + vintage sepia)    │
│  ┌───────────────────────────────────────┐  │
│  │  KaraokeSubtitle (SRT word highlight) │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  Scene sequence (608 scenes)    │  │  │
│  │  │  SceneImage / SceneVideo        │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  Audio (audio.wav full track)               │
└─────────────────────────────────────────────┘
```

## Visual Treatment

### Ken Burns on Images (513 scenes)

- **Movement**: Slow, continuous zoom + pan over full scene duration
- **Zoom range**: 1.0x → 1.08x to 1.15x (subtle, not dramatic)
- **Animation**: Remotion `interpolate()` with `Easing.inOut(Easing.ease)` for butter-smooth motion
- **Direction**: Randomized per scene (zoom in + pan left, zoom out + pan right, etc.) using scene number as seed for deterministic randomness
- **No abrupt start/stop**: Movement begins at frame 0 and ends at last frame — constant velocity feel

### Video Scenes (91 scenes)

- Scale to fill 1920x1080 (cover, no letterboxing)
- If video shorter than scene duration: use `<Loop durationInFrames={sceneDuration}>` wrapping the `<Video>` component
- If video longer: trim to scene duration via `endAt` prop

### Transitions

- **Default**: Hard cut (corte seco)
- **Block transitions**: 0.5s crossfade (15 frames) at narrative block boundaries
  - Uses `@remotion/transitions` with `<TransitionSeries>` and `fade()` from `@remotion/transitions/fade`
  - Block boundaries: crossfade every ~20 scenes as MVP heuristic
- **Fallback**: If `@remotion/transitions` causes issues, implement manual opacity crossfade

### Subtitles — Karaoke Style

- Parse `audio.srt` into timed word segments
- **Word timing**: Syllable-count weighted distribution (not character-count) with 150ms minimum floor per word to avoid ultra-short highlights on words like "y", "a", "que"
- Display full subtitle line at bottom-center
- Current word highlighted: white → gold/amber color transition
- Font: serif bold, ~44px, text-shadow for legibility on any background
- Position: bottom 10% of screen, centered, with semi-transparent dark pill background
- Smooth color transition per word using `interpolate()` on the word's time range

### Post-Processing

- **Vintage sepia + vignette**: Applied as FFmpeg post-render pass (not CSS filter) to avoid per-frame Chromium compositing overhead
  - `ffmpeg -i raw.mp4 -vf "colorbalance=rs=0.05:gs=-0.02:bs=-0.08,vignette=PI/4" -c:v libx264 -crf 18 final.mp4`
- This moves the color grading outside Remotion, significantly improving render performance

## Components

```
src/
├── index.ts                  # registerRoot
├── Root.tsx                  # Composition registration (fps, duration, dimensions)
├── Main.tsx                  # Sequences all 608 scenes with audio
├── components/
│   ├── SceneImage.tsx        # Ken Burns animation on still images
│   ├── SceneVideo.tsx        # Video playback with fill/trim/loop via <Loop>
│   ├── KaraokeSubtitle.tsx   # SRT parser + word-level highlight
│   └── Transition.tsx        # Crossfade wrapper using @remotion/transitions
├── lib/
│   ├── parse-scenes.ts       # Parse cenas-minutagem.md → [{sceneNum, startFrame, durationFrames, file}]
│   │                         # Handles dedup (ignore "(1)" files)
│   │                         # Handles filename special characters
│   ├── parse-srt.ts          # Parse audio.srt → [{start, end, text, words[]}]
│   │                         # Syllable-count weighted word timing with 150ms floor
│   └── ken-burns.ts          # Deterministic random direction/zoom per scene number
└── public/                   # Symlinked or --public-dir pointed to job assets
    ├── Cenas/
    ├── audio.wav
    └── audio.srt
```

## Data Flow

### Scene Timing — Anti-Drift Rule

`cenas-minutagem.md` provides exact timestamps per scene.

**CRITICAL**: Scene start frames MUST be computed from absolute timestamps (`Math.round(startSec * 30)`), NOT by accumulating previous scene durations. This prevents drift over 608 scenes.

```typescript
// CORRECT — absolute
const startFrame = Math.round(startSec * FPS);
const endFrame = Math.round(endSec * FPS);
const durationFrames = endFrame - startFrame;

// WRONG — cumulative
// startFrame = previousEndFrame; // drift accumulates
```

Total composition duration = `Math.ceil(totalAudioDurationSec * 30)`.

### Scene File Matching

For each scene number N, find file in `Cenas/` matching `Cena_NNN` (zero-padded). Prefer file without `(1)` suffix. Support both `.mp4` and `.jpg`/`.png` extensions.

### SRT Parsing

Standard SRT → subtitle entries → word-level timing via syllable-weighted distribution:
```typescript
{ start: 0.0, end: 2.32, text: "Todavía puedo sentir sus manos.", words: [
  { word: "Todavía", startSec: 0.0, endSec: 0.58 },   // 4 syllables
  { word: "puedo", startSec: 0.58, endSec: 0.97 },     // 2 syllables
  { word: "sentir", startSec: 0.97, endSec: 1.36 },    // 2 syllables
  { word: "sus", startSec: 1.36, endSec: 1.55 },       // 1 syllable (floor: 150ms)
  { word: "manos.", startSec: 1.55, endSec: 2.32 },    // 2 syllables
]}
```

## Render Pipeline

```bash
# 1. Upload assets from Mac
rsync -avz ./16-TITULO/ root@65.109.85.250:/root/loopx-local/jobs/E/16/

# 2. SSH into Hetzner
ssh root@65.109.85.250

# 3. Test render (first 30 seconds)
cd /root/loopx-local/remotion
npx remotion render Main --output ../jobs/E/16/test.mp4 \
  --gl=swiftshader --frames=0-900 \
  --codec h264 --crf 18 --audio-codec aac --audio-bitrate 192k \
  --concurrency 4

# 4. Full render
npx remotion render Main --output ../jobs/E/16/raw.mp4 \
  --gl=swiftshader \
  --codec h264 --crf 18 --audio-codec aac --audio-bitrate 192k \
  --concurrency 4 --timeout 120

# 5. Post-process (vintage + vignette via FFmpeg)
ffmpeg -y -i ../jobs/E/16/raw.mp4 \
  -vf "colorbalance=rs=0.05:gs=-0.02:bs=-0.08,vignette=PI/4" \
  -c:v libx264 -preset medium -crf 18 \
  -c:a copy -movflags +faststart \
  ../jobs/E/16/final.mp4

# 6. Download result
rsync root@65.109.85.250:/root/loopx-local/jobs/E/16/final.mp4 ./
```

### Render Requirements

- **GL backend**: `--gl=swiftshader` required for headless Hetzner (no GPU)
  - Install if needed: `apt install -y libegl1-mesa libgl1-mesa-glx`
- **Concurrency**: Start at 4, monitor with `htop`. Increase if memory allows.
- **Timeout**: 120s per frame (2 min max)

### Estimated Render Time

- Hetzner: Ryzen 5, 64GB RAM, headless
- ~172,440 frames at 1080p with swiftshader
- Estimate: 3-6 hours with concurrency 4

## Error Handling

- Missing scene file → black frame with scene number overlay text
- Video decode failure → fallback to first frame extracted as image, apply Ken Burns
- SRT parse failure → render without subtitles, log warning
- Scene timing mismatch → stretch/compress last scene to match total audio duration
- Duplicate scene files → ignore `(1)` suffixed files, use original

## Dependencies

```json
{
  "remotion": "^4.0.434",
  "@remotion/cli": "^4.0.434",
  "@remotion/bundler": "^4.0.434",
  "@remotion/renderer": "^4.0.434",
  "@remotion/transitions": "^4.0.434",
  "@remotion/media-utils": "^4.0.434",
  "typescript": "^5.0.0"
}
```

Reuse node_modules from `/root/LoopX/` via symlink or fresh npm install.

## Validation Steps

1. **Pre-render test**: Render frames 0-900 (30s) — verify Ken Burns, subtitles, audio sync
2. **Spot check**: Render frame at 50%, 75%, 95% of total — verify no drift
3. **Full render**: Monitor memory with `htop` in second terminal
4. **Post-render**: Play in VLC, check audio sync at beginning, middle, and end

## Success Criteria

1. All 608 scenes rendered in correct order with correct timing
2. Audio perfectly synced — no drift over 95.8 minutes (verify at start, middle, end)
3. Ken Burns on all images: smooth, no jitter, no abrupt start/stop
4. Karaoke subtitles: word highlight tracks audio accurately (150ms floor)
5. Vintage + vignette filter applied consistently via FFmpeg post-pass
6. Output plays correctly in VLC and YouTube upload
