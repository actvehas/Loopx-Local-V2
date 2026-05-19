import fs from "fs";

const FPS = 30;

export interface SceneData {
  sceneNum: number;
  startFrame: number;
  durationFrames: number;
  file: string;
  isVideo: boolean;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

export function parseScenes(
  minutagemPath: string,
  cenasDir: string
): SceneData[] {
  const content = fs.readFileSync(minutagemPath, "utf-8");
  const lines = content.split("\n");

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

  // List files, dedup (ignore "(1)" files)
  const allFiles = fs.readdirSync(cenasDir);
  const fileMap = new Map<number, string>();

  for (const file of allFiles) {
    if (file.includes("(1)")) continue;
    const numMatch = file.match(/Cena[_ ]?(\d+)/i);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1]);
    if (!fileMap.has(num)) {
      fileMap.set(num, file);
    }
  }

  // ABSOLUTE frame positions (anti-drift)
  // Each scene extends to the START of the next scene (no gaps)
  const scenes: SceneData[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const startFrame = Math.round(e.startSec * FPS);
    // End frame = start of next scene (eliminates gaps)
    const endFrame = i < entries.length - 1
      ? Math.round(entries[i + 1].startSec * FPS)
      : Math.round(e.endSec * FPS);
    const file = fileMap.get(e.sceneNum) || "";
    const isVideo = file.toLowerCase().endsWith(".mp4");

    scenes.push({
      sceneNum: e.sceneNum,
      startFrame,
      durationFrames: Math.max(1, endFrame - startFrame),
      file,
      isVideo,
    });
  }

  return scenes;
}

export function getTotalDuration(scenes: SceneData[]): number {
  const last = scenes[scenes.length - 1];
  return last.startFrame + last.durationFrames;
}
