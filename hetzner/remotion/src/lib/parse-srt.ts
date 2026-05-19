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
  const [h, m, rest] = time.split(":");
  const [s, ms] = rest.split(",");
  return (
    parseInt(h) * 3600 +
    parseInt(m) * 60 +
    parseInt(s) +
    parseInt(ms) / 1000
  );
}

function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  if (clean.length === 0) return 1;
  const vowelGroups = clean.match(/[aeiouáéíóúü]+/g);
  return Math.max(vowelGroups ? vowelGroups.length : 1, 1);
}

const MIN_WORD_DURATION = 0.15;

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

    const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
    const syllableCounts = rawWords.map(countSyllables);
    const totalSyllables = syllableCounts.reduce((a, b) => a + b, 0);
    const totalDuration = endSec - startSec;

    const words: SubtitleWord[] = [];
    let cursor = startSec;

    for (let i = 0; i < rawWords.length; i++) {
      const proportion = syllableCounts[i] / totalSyllables;
      let wordDuration = totalDuration * proportion;
      wordDuration = Math.max(wordDuration, MIN_WORD_DURATION);
      words.push({
        word: rawWords[i],
        startSec: cursor,
        endSec: cursor + wordDuration,
      });
      cursor += wordDuration;
    }

    // Normalize to fit exact duration
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
      words[words.length - 1].endSec = endSec;
    }

    entries.push({ index, startSec, endSec, text, words });
  }

  return entries;
}
