#!/usr/bin/env node
/**
 * LoopX Local — Assembly Script (Hetzner)
 *
 * Monta vídeo final a partir de: Cenas/*.mp4 + audio.wav + audio.srt
 *
 * Uso: node assemble.js CANAL NUM
 * Exemplo: node assemble.js E 16
 *
 * Estrutura esperada em /root/loopx-local/jobs/CANAL/NUM/:
 *   audio.wav       — áudio narrado completo
 *   audio.srt       — legendas timestamped
 *   Cenas/          — vídeos das cenas (Cena_001.mp4, Cena_002.mp4, ...)
 *
 * Output: /root/loopx-local/jobs/CANAL/NUM/final.mp4
 */

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

// Config
const JOBS_DIR = "/root/loopx-local/jobs";
const ASSETS_DIR = "/root/loopx-local/assets";
const CHANNELS_JSON = "/root/loopx-local/config/channels.json";
const FFMPEG = "ffmpeg";
const FFPROBE = "ffprobe";
const CROSSFADE = 0.6;
const CRF = 18;
const SILENCE_THRESHOLD = "-40dB";
const SILENCE_MIN_DURATION = 0.5;

// Load per-channel config (subtitles toggle, music file, music volume)
function loadChannelConfig(canal) {
  try {
    const raw = fs.readFileSync(CHANNELS_JSON, "utf8");
    const all = JSON.parse(raw);
    return all[canal] || {};
  } catch {
    return {};
  }
}

// Args
const CANAL = process.argv[2];
const NUM = process.argv[3];

if (!CANAL || !NUM) {
  console.log("Uso: node assemble.js CANAL NUM");
  console.log("Exemplo: node assemble.js E 16");
  process.exit(1);
}

const JOB_DIR = path.join(JOBS_DIR, CANAL, NUM);
const CENAS_DIR = path.join(JOB_DIR, "Cenas");
const AUDIO_PATH = path.join(JOB_DIR, "audio.wav");
const SRT_PATH = path.join(JOB_DIR, "audio.srt");
const OUTPUT_PATH = path.join(JOB_DIR, "final.mp4");
const LOG_PATH = path.join(JOB_DIR, "assembly.log");

// Logger
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + "\n");
}

async function run(cmd, timeoutMs = 600000) {
  return execAsync(cmd, { timeout: timeoutMs, maxBuffer: 100 * 1024 * 1024 });
}

async function getMediaDuration(filePath) {
  try {
    const { stdout } = await run(
      `${FFPROBE} -v error -show_entries format=duration -of csv=p=0 "${filePath}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  log(`=== ASSEMBLY START — Canal ${CANAL}, Episódio ${NUM} ===`);

  // Validate inputs
  if (!fs.existsSync(AUDIO_PATH)) {
    log(`ERRO: audio.wav não encontrado em ${JOB_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(SRT_PATH)) {
    log(`ERRO: audio.srt não encontrado em ${JOB_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(CENAS_DIR)) {
    log(`ERRO: pasta Cenas/ não encontrada em ${JOB_DIR}`);
    process.exit(1);
  }

  // Get audio duration
  const audioDuration = await getMediaDuration(AUDIO_PATH);
  log(`Áudio: ${audioDuration.toFixed(1)}s (${(audioDuration / 60).toFixed(1)} min)`);

  // Find all scene files (mp4 videos + jpg/png images) sorted by scene number
  const SUPPORTED_EXT = [".mp4", ".jpg", ".jpeg", ".png", ".webp"];
  const sceneFiles = fs.readdirSync(CENAS_DIR)
    .filter(f => SUPPORTED_EXT.some(ext => f.toLowerCase().endsWith(ext)))
    .sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)/)?.[1] || "0");
      const numB = parseInt(b.match(/(\d+)/)?.[1] || "0");
      return numA - numB;
    })
    .map(f => path.join(CENAS_DIR, f));

  const imageCount = sceneFiles.filter(f => !f.endsWith(".mp4")).length;
  const videoCount = sceneFiles.filter(f => f.endsWith(".mp4")).length;
  log(`Mix: ${videoCount} vídeos + ${imageCount} imagens`);

  log(`Cenas encontradas: ${sceneFiles.length}`);

  if (sceneFiles.length === 0) {
    log("ERRO: nenhum vídeo .mp4 encontrado em Cenas/");
    process.exit(1);
  }

  // Step 1: Remove silence from audio
  log("PASSO 1: Removendo silêncio do áudio...");
  const audioClean = path.join(JOB_DIR, "audio-clean.wav");
  try {
    await run(
      `${FFMPEG} -y -i "${AUDIO_PATH}" -af "silenceremove=stop_periods=-1:stop_duration=${SILENCE_MIN_DURATION}:stop_threshold=${SILENCE_THRESHOLD}" "${audioClean}"`
    );
    log("Silêncio removido");
  } catch (e) {
    log(`AVISO: Remoção de silêncio falhou, usando áudio original: ${e.message}`);
    fs.copyFileSync(AUDIO_PATH, audioClean);
  }

  const cleanDuration = await getMediaDuration(audioClean);
  log(`Áudio limpo: ${cleanDuration.toFixed(1)}s`);

  // Step 2: Normalize all scene videos to same format (1920x1080, 30fps)
  log("PASSO 2: Normalizando cenas...");
  const normalizedDir = path.join(JOB_DIR, "normalized");
  if (!fs.existsSync(normalizedDir)) fs.mkdirSync(normalizedDir, { recursive: true });

  const targetDurationPerScene = cleanDuration / sceneFiles.length;
  log(`Duração alvo por cena: ${targetDurationPerScene.toFixed(2)}s`);

  const normalizedFiles = [];
  for (let i = 0; i < sceneFiles.length; i++) {
    const input = sceneFiles[i];
    const output = path.join(normalizedDir, `scene_${String(i).padStart(4, "0")}.mp4`);
    const sceneDur = await getMediaDuration(input);

    if (i % 50 === 0) log(`  Normalizando cena ${i + 1}/${sceneFiles.length}...`);

    const isImage = [".jpg", ".jpeg", ".png", ".webp"].some(ext => input.toLowerCase().endsWith(ext));

    try {
      if (isImage) {
        // Ken Burns: slow zoom-in + slight pan on still image
        const fps = 30;
        const totalFrames = Math.ceil(targetDurationPerScene * fps);
        // Random direction: zoom in or zoom out, pan left or right
        const zoomStart = 1.0;
        const zoomEnd = 1.15; // 15% zoom over duration
        const zoomPerFrame = (zoomEnd - zoomStart) / totalFrames;
        // zoompan: zoom from 1.0→1.15, pan slightly
        const kenBurns = `zoompan=z='${zoomStart}+${zoomPerFrame.toFixed(8)}*in':x='iw/2-(iw/zoom/2)+in*0.3':y='ih/2-(ih/zoom/2)+in*0.15':d=${totalFrames}:s=1920x1080:fps=${fps}`;
        await run(
          `${FFMPEG} -y -loop 1 -i "${input}" ` +
          `-vf "${kenBurns}" ` +
          `-t ${targetDurationPerScene.toFixed(3)} ` +
          `-c:v libx264 -preset fast -crf ${CRF} -pix_fmt yuv420p -an "${output}"`,
          180000
        );
      } else if (sceneDur >= targetDurationPerScene) {
        // Video: trim to target duration
        await run(
          `${FFMPEG} -y -i "${input}" -t ${targetDurationPerScene.toFixed(3)} ` +
          `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" ` +
          `-r 30 -c:v libx264 -preset fast -crf ${CRF} -an "${output}"`,
          120000
        );
      } else {
        // Video too short: reverse-bounce to fill duration
        const scale = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1";
        const bounceFilter = `[0:v]${scale}[scaled];[scaled]split[fwd][rev];[rev]reverse[reversed];[fwd][reversed]concat=n=2:v=1:a=0[bounced]`;
        const loops = Math.ceil(targetDurationPerScene / Math.max(sceneDur * 2, 0.1));
        await run(
          `${FFMPEG} -y -stream_loop ${loops} -i "${input}" ` +
          `-filter_complex "${bounceFilter}" -map "[bounced]" ` +
          `-t ${targetDurationPerScene.toFixed(3)} ` +
          `-r 30 -c:v libx264 -preset fast -crf ${CRF} -an "${output}"`,
          120000
        );
      }
      normalizedFiles.push(output);
    } catch (e) {
      log(`  AVISO: Cena ${i + 1} falhou (${path.basename(input)}): ${e.message}`);
      // Generate black clip as fallback
      try {
        await run(
          `${FFMPEG} -y -f lavfi -i "color=c=black:s=1920x1080:d=${targetDurationPerScene.toFixed(3)}:r=30" ` +
          `-c:v libx264 -preset fast -crf ${CRF} -an "${output}"`,
          30000
        );
        normalizedFiles.push(output);
      } catch {
        log(`  ERRO: Não conseguiu nem gerar clip preto para cena ${i + 1}`);
      }
    }
  }

  log(`Cenas normalizadas: ${normalizedFiles.length}/${sceneFiles.length}`);

  // Step 3: Concatenate all normalized scenes
  log("PASSO 3: Concatenando cenas...");
  const concatFile = path.join(JOB_DIR, "concat.txt");
  const concatContent = normalizedFiles.map(f => `file '${f}'`).join("\n");
  fs.writeFileSync(concatFile, concatContent);

  const videoOnly = path.join(JOB_DIR, "video-only.mp4");
  await run(
    `${FFMPEG} -y -f concat -safe 0 -i "${concatFile}" -c copy "${videoOnly}"`,
    600000
  );

  const videoDuration = await getMediaDuration(videoOnly);
  log(`Vídeo concatenado: ${videoDuration.toFixed(1)}s`);

  // Step 4: Merge video + audio (+ optional subtitles + optional bg music)
  // Per-channel config: subtitles (default true), music (filename in assets/music/), music_volume (default 0.10)
  const chCfg = loadChannelConfig(CANAL);
  const wantSubs = chCfg.subtitles !== false; // default true unless explicitly disabled
  const musicFile = chCfg.music ? path.join(ASSETS_DIR, "music", chCfg.music) : null;
  const musicVol = typeof chCfg.music_volume === "number" ? chCfg.music_volume : 0.10;
  const hasMusic = musicFile && fs.existsSync(musicFile);

  log(`PASSO 4: Montagem final — subs=${wantSubs} | music=${hasMusic ? chCfg.music + ` @ vol ${musicVol}` : "off"}`);

  // Build video filter (subtitles burn-in or null)
  const srtEscaped = SRT_PATH.replace(/'/g, "\\'").replace(/:/g, "\\:");
  const subsFilter = wantSubs
    ? `-vf "subtitles='${srtEscaped}':force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=50'"`
    : "";

  // Build audio mix
  const narrationDur = await getMediaDuration(audioClean);
  let audioInputs, audioFilter, audioMap;
  if (hasMusic) {
    audioInputs = `-i "${audioClean}" -stream_loop -1 -i "${musicFile}"`;
    const fadeOutStart = Math.max(0, narrationDur - 4);
    audioFilter = `-filter_complex "[1:a]volume=1.0[narr];[2:a]volume=${musicVol},afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart}:d=4[bg];[narr][bg]amix=inputs=2:duration=first:dropout_transition=0[mix]"`;
    audioMap = `-map 0:v:0 -map "[mix]"`;
  } else {
    audioInputs = `-i "${audioClean}"`;
    audioFilter = "";
    audioMap = `-map 0:v:0 -map 1:a:0`;
  }

  const buildCmd = (withSubs) =>
    `${FFMPEG} -y -i "${videoOnly}" ${audioInputs} ` +
    (withSubs ? subsFilter + " " : "") +
    (audioFilter ? audioFilter + " " : "") +
    `${audioMap} ` +
    `-c:v libx264 -preset medium -crf ${CRF} ` +
    `-c:a aac -b:a 192k ` +
    `-t ${narrationDur} -movflags +faststart "${OUTPUT_PATH}"`;

  try {
    await run(buildCmd(wantSubs), 1800000);
  } catch (e) {
    if (wantSubs) {
      log(`AVISO: Legendas falharam, retry sem legendas: ${e.message}`);
      await run(buildCmd(false), 1800000);
    } else {
      throw e;
    }
  }

  // Verify output
  if (fs.existsSync(OUTPUT_PATH)) {
    const finalDuration = await getMediaDuration(OUTPUT_PATH);
    const fileSize = (fs.statSync(OUTPUT_PATH).size / (1024 * 1024)).toFixed(1);
    log(`=== ASSEMBLY COMPLETE ===`);
    log(`Output: ${OUTPUT_PATH}`);
    log(`Duração: ${finalDuration.toFixed(1)}s (${(finalDuration / 60).toFixed(1)} min)`);
    log(`Tamanho: ${fileSize} MB`);
  } else {
    log("ERRO: final.mp4 não foi criado");
    process.exit(1);
  }

  // Cleanup temp files
  log("Limpando temporários...");
  try {
    fs.unlinkSync(audioClean);
    fs.unlinkSync(videoOnly);
    fs.unlinkSync(concatFile);
    fs.rmSync(normalizedDir, { recursive: true, force: true });
  } catch {}

  log("Done.");
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
