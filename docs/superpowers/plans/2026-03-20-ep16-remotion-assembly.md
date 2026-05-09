# EP16 Remotion Assembly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render EP16 Confesiones (~95.8 min, 608 scenes) into a cinematic video with Ken Burns on images, karaoke subtitles, and vintage color grading.

**Architecture:** Standalone Remotion project on Hetzner (`/root/loopx-local/remotion/`). Assets uploaded via rsync. Remotion handles composition (scenes + subtitles), FFmpeg handles post-processing (color + vignette). Total: 172,440 frames at 1080p 30fps.

**Tech Stack:** Remotion 4.0.434, TypeScript, FFmpeg, Node.js 20

**Spec:** `docs/superpowers/specs/2026-03-20-ep16-remotion-assembly-design.md`

---

### Task 1: Project Scaffold on Hetzner

**Files:**
- Create: `/root/loopx-local/remotion/package.json`
- Create: `/root/loopx-local/remotion/tsconfig.json`
- Create: `/root/loopx-local/remotion/src/index.ts`
- Create: `/root/loopx-local/remotion/src/Root.tsx`

- [ ] **Step 1: Create project directory and package.json**

```bash
ssh root@65.109.85.250 "mkdir -p /root/loopx-local/remotion/src/components /root/loopx-local/remotion/src/lib"
```

Write `package.json`:
```json
{
  "name": "ep16-assembly",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "remotion bundle",
    "render": "remotion render",
    "preview": "remotion preview"
  },
  "dependencies": {
    "remotion": "^4.0.434",
    "@remotion/cli": "^4.0.434",
    "@remotion/bundler": "^4.0.434",
    "@remotion/renderer": "^4.0.434",
    "@remotion/transitions": "^4.0.434",
    "@remotion/media-utils": "^4.0.434",
    "typescript": "^5.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@types/react": "^18.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create entry point `src/index.ts`**

```typescript
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

- [ ] **Step 4: Create placeholder `src/Root.tsx`**

```tsx
import React from "react";
import { Composition } from "remotion";

const Placeholder: React.FC = () => <div style={{ background: "black", width: 1920, height: 1080 }} />;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Placeholder}
    durationInFrames={900}
    fps={30}
    width={1920}
    height={1080}
  />
);
```

- [ ] **Step 5: Install dependencies and verify**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && npm install"
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && npx remotion render Main --gl=swiftshader --frames=0-1 --output /tmp/test.mp4 --codec h264"
```

Expected: renders 2 black frames without error.

- [ ] **Step 6: Commit scaffold**

---

### Task 2: Upload Assets via rsync

- [ ] **Step 1: Create job directory on Hetzner**

```bash
ssh root@65.109.85.250 "mkdir -p /root/loopx-local/jobs/E/16/Cenas"
```

- [ ] **Step 2: Upload audio + SRT + scene timing**

```bash
EPISODE="/Users/jaci/Documents/Obsidian Vault/Projetos/Confesiones de las Abuelas/16 - A MIS 78 ME AGARRÓ TAN FUERTE QUE GRITÉ"
rsync -avz --progress "$EPISODE/audio.wav" "$EPISODE/audio.srt" "$EPISODE/cenas-minutagem.md" root@65.109.85.250:/root/loopx-local/jobs/E/16/
```

- [ ] **Step 3: Upload Cenas/ (795MB)**

```bash
rsync -avz --progress "$EPISODE/Cenas/" root@65.109.85.250:/root/loopx-local/jobs/E/16/Cenas/
```

Expected: ~5-15 min depending on bandwidth.

- [ ] **Step 4: Symlink assets into Remotion public dir**

```bash
ssh root@65.109.85.250 "ln -sfn /root/loopx-local/jobs/E/16 /root/loopx-local/remotion/public/assets"
```

- [ ] **Step 5: Verify file counts**

```bash
ssh root@65.109.85.250 "ls /root/loopx-local/jobs/E/16/Cenas/ | wc -l && ls /root/loopx-local/jobs/E/16/audio.wav && ls /root/loopx-local/jobs/E/16/audio.srt"
```

Expected: 618 files, audio.wav exists, audio.srt exists.

---

### Task 3: Scene Parser (`parse-scenes.ts`)

**Files:**
- Create: `/root/loopx-local/remotion/src/lib/parse-scenes.ts`

- [ ] **Step 1: Write the parser**

```typescript
import fs from "fs";
import path from "path";

const FPS = 30;

export interface SceneData {
  sceneNum: number;
  startFrame: number;
  durationFrames: number;
  file: string;       // filename in Cenas/
  isVideo: boolean;
}

function parseTimestamp(ts: string): number {
  // "0:09" → 9, "95:48" → 5748
  const parts = ts.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

export function parseScenes(
  minutagemPath: string,
  cenasDir: string
): SceneData[] {
  const content = fs.readFileSync(minutagemPath, "utf-8");
  const lines = content.split("\n");

  // Parse all scene entries
  const entries: { sceneNum: number; startSec: number; endSec: number }[] = [];
  for (const line of lines) {
    const match = line.match(/^Cena (\d+) \((\d+:\d+)-(\d+:\d+)\)/);
    if (!match) continue;
    entries.push({
      sceneNum: parseInt(match[1]),
      startSec: parseTimestamp(match[2]),
      endSec: parseTimestamp(match[3]),
    });
  }

  // List all files in Cenas/, dedup (ignore "(1)" files)
  const allFiles = fs.readdirSync(cenasDir);
  const fileMap = new Map<number, string>();

  for (const file of allFiles) {
    // Skip duplicates with (1) suffix
    if (file.includes("(1)")) continue;
    const numMatch = file.match(/Cena[_ ]?(\d+)/i);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1]);
    // Prefer existing (first found wins, but originals come before dupes)
    if (!fileMap.has(num)) {
      fileMap.set(num, file);
    }
  }

  // Build scene data with ABSOLUTE frame positions (anti-drift)
  return entries.map((e) => {
    const startFrame = Math.round(e.startSec * FPS);
    const endFrame = Math.round(e.endSec * FPS);
    const file = fileMap.get(e.sceneNum) || "";
    const isVideo = file.toLowerCase().endsWith(".mp4");

    return {
      sceneNum: e.sceneNum,
      startFrame,
      durationFrames: endFrame - startFrame,
      file,
      isVideo,
    };
  });
}

export function getTotalDuration(scenes: SceneData[]): number {
  const last = scenes[scenes.length - 1];
  return last.startFrame + last.durationFrames;
}
```

- [ ] **Step 2: Quick validation test**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && node -e \"
const {parseScenes, getTotalDuration} = require('./src/lib/parse-scenes');
const scenes = parseScenes('/root/loopx-local/jobs/E/16/cenas-minutagem.md', '/root/loopx-local/jobs/E/16/Cenas');
console.log('Scenes:', scenes.length);
console.log('First:', JSON.stringify(scenes[0]));
console.log('Last:', JSON.stringify(scenes[scenes.length-1]));
console.log('Total frames:', getTotalDuration(scenes));
console.log('Missing files:', scenes.filter(s => !s.file).length);
\""
```

Expected: 608 scenes, total ~172440 frames, 0 missing files.

- [ ] **Step 3: Commit**

---

### Task 4: SRT Parser with Karaoke Timing (`parse-srt.ts`)

**Files:**
- Create: `/root/loopx-local/remotion/src/lib/parse-srt.ts`

- [ ] **Step 1: Write the SRT parser**

```typescript
export interface SubtitleWord {
  word: string;
  startSec: number;
  endSec: number;
}

export interface SubtitleEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  words: SubtitleWord[];
}

function parseSrtTime(time: string): number {
  // "00:01:23,456" → 83.456
  const [h, m, rest] = time.split(":");
  const [s, ms] = rest.split(",");
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

// Spanish syllable counter (approximate)
function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  if (clean.length === 0) return 1;
  // Count vowel groups
  const vowelGroups = clean.match(/[aeiouáéíóúü]+/g);
  return Math.max(vowelGroups ? vowelGroups.length : 1, 1);
}

const MIN_WORD_DURATION = 0.15; // 150ms floor

export function parseSrt(content: string): SubtitleEntry[] {
  const blocks = content.trim().split(/\n\n+/);
  const entries: SubtitleEntry[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;

    const startSec = parseSrtTime(timeMatch[1]);
    const endSec = parseSrtTime(timeMatch[2]);
    const text = lines.slice(2).join(" ").trim();

    // Split into words and distribute timing by syllable count
    const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
    const syllableCounts = rawWords.map(countSyllables);
    const totalSyllables = syllableCounts.reduce((a, b) => a + b, 0);
    const totalDuration = endSec - startSec;

    // First pass: proportional distribution
    let words: SubtitleWord[] = [];
    let cursor = startSec;

    for (let i = 0; i < rawWords.length; i++) {
      const proportion = syllableCounts[i] / totalSyllables;
      let wordDuration = totalDuration * proportion;
      // Apply floor
      wordDuration = Math.max(wordDuration, MIN_WORD_DURATION);
      words.push({
        word: rawWords[i],
        startSec: cursor,
        endSec: cursor + wordDuration,
      });
      cursor += wordDuration;
    }

    // Normalize: scale to fit exact duration
    if (words.length > 0) {
      const actualEnd = words[words.length - 1].endSec;
      const scale = totalDuration / (actualEnd - startSec);
      cursor = startSec;
      for (const w of words) {
        const dur = (w.endSec - w.startSec) * scale;
        w.startSec = cursor;
        w.endSec = cursor + dur;
        cursor += dur;
      }
      // Snap last word to exact end
      words[words.length - 1].endSec = endSec;
    }

    entries.push({ index, startSec, endSec, text, words });
  }

  return entries;
}
```

- [ ] **Step 2: Validate with first few entries**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && node -e \"
const fs = require('fs');
const {parseSrt} = require('./src/lib/parse-srt');
const srt = fs.readFileSync('/root/loopx-local/jobs/E/16/audio.srt', 'utf-8');
const entries = parseSrt(srt);
console.log('Total entries:', entries.length);
console.log('First:', JSON.stringify(entries[0], null, 2));
console.log('Last end:', entries[entries.length-1].endSec.toFixed(2) + 's');
\""
```

Expected: hundreds of entries, first has syllable-weighted word timing.

- [ ] **Step 3: Commit**

---

### Task 5: Ken Burns Config (`ken-burns.ts`)

**Files:**
- Create: `/root/loopx-local/remotion/src/lib/ken-burns.ts`

- [ ] **Step 1: Write deterministic Ken Burns generator**

```typescript
// Deterministic pseudo-random from scene number (no Math.random)
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

export interface KenBurnsConfig {
  zoomStart: number;
  zoomEnd: number;
  panXStart: number; // -1 to 1 (percentage offset)
  panXEnd: number;
  panYStart: number;
  panYEnd: number;
}

export function getKenBurns(sceneNum: number): KenBurnsConfig {
  const r1 = seededRandom(sceneNum);
  const r2 = seededRandom(sceneNum + 1000);
  const r3 = seededRandom(sceneNum + 2000);

  // Zoom: either in (1.0→1.08-1.15) or out (1.08-1.15→1.0)
  const zoomIn = r1 > 0.5;
  const zoomAmount = 1.0 + 0.08 + r2 * 0.07; // 1.08 to 1.15

  // Pan: subtle drift in random direction
  const panAmount = 0.02 + r3 * 0.03; // 2-5% of frame
  const panAngle = r1 * Math.PI * 2;

  const panXDelta = Math.cos(panAngle) * panAmount;
  const panYDelta = Math.sin(panAngle) * panAmount;

  return {
    zoomStart: zoomIn ? 1.0 : zoomAmount,
    zoomEnd: zoomIn ? zoomAmount : 1.0,
    panXStart: zoomIn ? 0 : panXDelta,
    panXEnd: zoomIn ? panXDelta : 0,
    panYStart: zoomIn ? 0 : panYDelta,
    panYEnd: zoomIn ? panYDelta : 0,
  };
}
```

- [ ] **Step 2: Commit**

---

### Task 6: SceneImage Component

**Files:**
- Create: `/root/loopx-local/remotion/src/components/SceneImage.tsx`

- [ ] **Step 1: Write SceneImage with Ken Burns**

```tsx
import React from "react";
import { Img, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";
import { getKenBurns } from "../lib/ken-burns";

interface Props {
  file: string;
  sceneNum: number;
  durationFrames: number;
}

export const SceneImage: React.FC<Props> = ({ file, sceneNum, durationFrames }) => {
  const frame = useCurrentFrame();
  const kb = getKenBurns(sceneNum);

  const progress = interpolate(frame, [0, durationFrames - 1], [0, 1], {
    easing: Easing.inOut(Easing.ease),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(progress, [0, 1], [kb.zoomStart, kb.zoomEnd]);
  const translateX = interpolate(progress, [0, 1], [kb.panXStart * 100, kb.panXEnd * 100]);
  const translateY = interpolate(progress, [0, 1], [kb.panYStart * 100, kb.panYEnd * 100]);

  return (
    <div style={{ width: 1920, height: 1080, overflow: "hidden", position: "relative" }}>
      <Img
        src={staticFile(`assets/Cenas/${file}`)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
};
```

- [ ] **Step 2: Commit**

---

### Task 7: SceneVideo Component

**Files:**
- Create: `/root/loopx-local/remotion/src/components/SceneVideo.tsx`

- [ ] **Step 1: Write SceneVideo with loop support**

```tsx
import React from "react";
import { Video, staticFile, Loop } from "remotion";

interface Props {
  file: string;
  durationFrames: number;
}

export const SceneVideo: React.FC<Props> = ({ file, durationFrames }) => {
  return (
    <div style={{ width: 1920, height: 1080, overflow: "hidden" }}>
      <Loop durationInFrames={durationFrames}>
        <Video
          src={staticFile(`assets/Cenas/${file}`)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </Loop>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

---

### Task 8: KaraokeSubtitle Component

**Files:**
- Create: `/root/loopx-local/remotion/src/components/KaraokeSubtitle.tsx`

- [ ] **Step 1: Write karaoke subtitle renderer**

```tsx
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { SubtitleEntry } from "../lib/parse-srt";

interface Props {
  subtitles: SubtitleEntry[];
}

export const KaraokeSubtitle: React.FC<Props> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = frame / fps;

  // Find the active subtitle
  const active = subtitles.find(
    (s) => currentSec >= s.startSec && currentSec <= s.endSec
  );

  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "10%",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "8px",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: "12px 24px",
        borderRadius: "8px",
        maxWidth: "80%",
      }}
    >
      {active.words.map((word, i) => {
        // Calculate highlight progress for this word
        const wordProgress = interpolate(
          currentSec,
          [word.startSec, word.endSec],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        const color =
          wordProgress > 0.5
            ? "#FFD700" // gold — highlighted
            : currentSec >= word.startSec
            ? interpolateColor(wordProgress)
            : "rgba(255, 255, 255, 0.7)"; // dimmed — not yet

        return (
          <span
            key={i}
            style={{
              fontFamily: "'Georgia', serif",
              fontWeight: "bold",
              fontSize: "44px",
              color,
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              transition: "color 0.05s",
            }}
          >
            {word.word}
          </span>
        );
      })}
    </div>
  );
};

function interpolateColor(progress: number): string {
  // White → Gold transition
  const r = Math.round(255);
  const g = Math.round(255 - (255 - 215) * progress);
  const b = Math.round(255 - 255 * progress);
  return `rgb(${r}, ${g}, ${b})`;
}
```

- [ ] **Step 2: Commit**

---

### Task 9: Main Composition

**Files:**
- Create: `/root/loopx-local/remotion/src/Main.tsx`
- Modify: `/root/loopx-local/remotion/src/Root.tsx`

- [ ] **Step 1: Write Main composition**

```tsx
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SceneImage } from "./components/SceneImage";
import { SceneVideo } from "./components/SceneVideo";
import { KaraokeSubtitle } from "./components/KaraokeSubtitle";
import { parseScenes, getTotalDuration, SceneData } from "./lib/parse-scenes";
import { parseSrt, SubtitleEntry } from "./lib/parse-srt";
import fs from "fs";

const JOBS_DIR = "/root/loopx-local/jobs/E/16";

// Load data at module level (runs once during bundling)
let scenes: SceneData[] = [];
let subtitles: SubtitleEntry[] = [];
let totalFrames = 172440; // fallback

try {
  scenes = parseScenes(`${JOBS_DIR}/cenas-minutagem.md`, `${JOBS_DIR}/Cenas`);
  totalFrames = getTotalDuration(scenes);
} catch (e) {
  console.error("Failed to parse scenes:", e);
}

try {
  const srtContent = fs.readFileSync(`${JOBS_DIR}/audio.srt`, "utf-8");
  subtitles = parseSrt(srtContent);
} catch (e) {
  console.error("Failed to parse SRT:", e);
}

export { totalFrames };

export const Main: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Layer 1: Scene visuals */}
      {scenes.map((scene) => (
        <Sequence
          key={scene.sceneNum}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          {scene.file === "" ? (
            // Missing scene fallback: black with number
            <AbsoluteFill
              style={{
                backgroundColor: "black",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "red",
                fontSize: 48,
              }}
            >
              MISSING: Scene {scene.sceneNum}
            </AbsoluteFill>
          ) : scene.isVideo ? (
            <SceneVideo file={scene.file} durationFrames={scene.durationFrames} />
          ) : (
            <SceneImage
              file={scene.file}
              sceneNum={scene.sceneNum}
              durationFrames={scene.durationFrames}
            />
          )}
        </Sequence>
      ))}

      {/* Layer 2: Karaoke subtitles */}
      <AbsoluteFill>
        <KaraokeSubtitle subtitles={subtitles} />
      </AbsoluteFill>

      {/* Layer 3: Audio */}
      <Audio src={staticFile("assets/audio.wav")} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Update Root.tsx with real composition**

```tsx
import React from "react";
import { Composition } from "remotion";
import { Main, totalFrames } from "./Main";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Main}
    durationInFrames={totalFrames}
    fps={30}
    width={1920}
    height={1080}
  />
);
```

- [ ] **Step 3: Commit**

---

### Task 10: Test Render (30 seconds)

- [ ] **Step 1: Render first 30 seconds**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && npx remotion render Main \
  --gl=swiftshader \
  --frames=0-900 \
  --output /root/loopx-local/jobs/E/16/test-30s.mp4 \
  --codec h264 --crf 18 \
  --audio-codec aac --audio-bitrate 192k \
  --concurrency 4 --timeout 120"
```

- [ ] **Step 2: Download and review test video**

```bash
rsync root@65.109.85.250:/root/loopx-local/jobs/E/16/test-30s.mp4 ~/Downloads/
open ~/Downloads/test-30s.mp4
```

Verify:
- Ken Burns smooth on images
- Video scenes display correctly
- Karaoke subtitle words highlight in sync
- Audio plays and syncs with visuals

- [ ] **Step 3: Fix any issues found, re-render if needed**

---

### Task 11: Spot Check Renders

- [ ] **Step 1: Render middle section (frame ~86000, around 47 min)**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && npx remotion render Main \
  --gl=swiftshader --frames=85200-86100 \
  --output /root/loopx-local/jobs/E/16/test-mid.mp4 \
  --codec h264 --crf 18 --audio-codec aac --audio-bitrate 192k \
  --concurrency 4 --timeout 120"
```

- [ ] **Step 2: Render end section (frame ~170000, around 94 min)**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && npx remotion render Main \
  --gl=swiftshader --frames=169200-170100 \
  --output /root/loopx-local/jobs/E/16/test-end.mp4 \
  --codec h264 --crf 18 --audio-codec aac --audio-bitrate 192k \
  --concurrency 4 --timeout 120"
```

- [ ] **Step 3: Download and verify no drift**

```bash
rsync root@65.109.85.250:/root/loopx-local/jobs/E/16/test-mid.mp4 ~/Downloads/
rsync root@65.109.85.250:/root/loopx-local/jobs/E/16/test-end.mp4 ~/Downloads/
```

Check: subtitles match audio, scenes match expected content.

---

### Task 12: Full Render

- [ ] **Step 1: Launch full render in background**

```bash
ssh root@65.109.85.250 "cd /root/loopx-local/remotion && nohup npx remotion render Main \
  --gl=swiftshader \
  --output /root/loopx-local/jobs/E/16/raw.mp4 \
  --codec h264 --crf 18 \
  --audio-codec aac --audio-bitrate 192k \
  --concurrency 4 --timeout 120 \
  > /root/loopx-local/jobs/E/16/render.log 2>&1 &"
```

- [ ] **Step 2: Monitor progress**

```bash
ssh root@65.109.85.250 "tail -f /root/loopx-local/jobs/E/16/render.log"
```

Expected: 3-6 hours. Monitor memory with `htop` in another terminal.

- [ ] **Step 3: Verify output exists**

```bash
ssh root@65.109.85.250 "ls -lh /root/loopx-local/jobs/E/16/raw.mp4 && ffprobe -v error -show_entries format=duration -of csv=p=0 /root/loopx-local/jobs/E/16/raw.mp4"
```

Expected: file exists, duration ~5748 seconds.

---

### Task 13: Post-Processing (Vintage + Vignette)

- [ ] **Step 1: Apply color grading via FFmpeg**

```bash
ssh root@65.109.85.250 "ffmpeg -y -i /root/loopx-local/jobs/E/16/raw.mp4 \
  -vf 'colorbalance=rs=0.05:gs=-0.02:bs=-0.08,vignette=PI/4' \
  -c:v libx264 -preset medium -crf 18 \
  -c:a copy -movflags +faststart \
  /root/loopx-local/jobs/E/16/final.mp4"
```

Expected: ~30-60 min.

- [ ] **Step 2: Verify final output**

```bash
ssh root@65.109.85.250 "ls -lh /root/loopx-local/jobs/E/16/final.mp4 && ffprobe -v error -show_entries format=duration -of csv=p=0 /root/loopx-local/jobs/E/16/final.mp4"
```

- [ ] **Step 3: Download final video**

```bash
rsync --progress root@65.109.85.250:/root/loopx-local/jobs/E/16/final.mp4 ~/Downloads/EP16-final.mp4
```

- [ ] **Step 4: Review full video in VLC — check start, middle, end**

---

### Task 14: Cleanup and Documentation

- [ ] **Step 1: Remove intermediate files on Hetzner**

```bash
ssh root@65.109.85.250 "rm -f /root/loopx-local/jobs/E/16/raw.mp4 /root/loopx-local/jobs/E/16/test-*.mp4 /root/loopx-local/jobs/E/16/render.log"
```

- [ ] **Step 2: Update daily note with result**

Append to Obsidian `Daily/2026-03-20.md`:
- Render completed, duration, file size
- Any issues found and fixed
- Link to final video location

- [ ] **Step 3: Update pipeline status**

```
Fase 5: Montagem ✅ (final.mp4 renderizado na Hetzner)
```
