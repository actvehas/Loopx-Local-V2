#!/usr/bin/env node
/**
 * Render script that loads props from file and renders via Remotion API.
 *
 * Usage:
 *   node render.mjs [--frames START-END] [--output path] [--concurrency N]
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const JOBS_DIR = getArg("--jobs", "/root/loopx-local/jobs/E/16");
const outputFile = getArg("--output", `${JOBS_DIR}/raw.mp4`);
const framesArg = getArg("--frames", null);
const concurrency = parseInt(getArg("--concurrency", "4"));

// Load props
console.log("Loading props...");
const propsPath = `${JOBS_DIR}/props.json`;
if (!fs.existsSync(propsPath)) {
  console.log("Generating props...");
  const { execSync } = await import("child_process");
  execSync(`node ${path.join(__dirname, "prepare-props.js")} "${JOBS_DIR}" > "${propsPath}" 2>/dev/null`);
}
const inputProps = JSON.parse(fs.readFileSync(propsPath, "utf-8"));
console.log(`Scenes: ${inputProps.scenes.length}, Subtitles: ${inputProps.subtitles.length}, Frames: ${inputProps.totalFrames}`);

// Parse frames
let frameRange = undefined;
if (framesArg) {
  const [start, end] = framesArg.split("-").map(Number);
  frameRange = [start, end];
}

// Bundle
console.log("Bundling...");
const bundled = await bundle({
  entryPoint: path.join(__dirname, "src/index.ts"),
  publicDir: path.join(__dirname, "public"),
});

// Select composition
console.log("Selecting composition...");
const composition = await selectComposition({
  serveUrl: bundled,
  id: "Main",
  inputProps,
});

// Override frames if specified
if (frameRange) {
  console.log(`Rendering frames ${frameRange[0]}-${frameRange[1]}...`);
} else {
  console.log(`Rendering all ${composition.durationInFrames} frames...`);
}

// Render
console.log(`Output: ${outputFile}`);
console.log(`Concurrency: ${concurrency}`);

await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: outputFile,
  inputProps,
  concurrency,
  timeoutInMilliseconds: 120000,
  chromiumOptions: {
    gl: "swiftshader",
  },
  crf: 18,
  audioBitrate: "192k",
  audioCodec: "aac",
  frameRange: frameRange || undefined,
  onProgress: ({ renderedFrames, totalFrames }) => {
    if (renderedFrames % 100 === 0 || renderedFrames === totalFrames) {
      const pct = ((renderedFrames / totalFrames) * 100).toFixed(1);
      process.stdout.write(`\rRendered ${renderedFrames}/${totalFrames} (${pct}%)`);
    }
  },
});

console.log(`\n✅ Done: ${outputFile}`);
const stat = fs.statSync(outputFile);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
