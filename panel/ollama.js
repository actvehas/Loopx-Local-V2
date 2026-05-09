const http = require('http');
const fs = require('fs');
const path = require('path');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// Model config — swap easily
const MODELS = {
  mechanical: process.env.OLLAMA_MODEL || 'llama3.1:8b',
  // If you pull qwen2.5, change here:
  // mechanical: 'qwen2.5:72b',
};

function loadSkill(skillName) {
  const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill not found: ${skillPath}`);
  }
  return fs.readFileSync(skillPath, 'utf-8');
}

async function ollamaChat(model, systemPrompt, userPrompt, onToken) {
  const url = new URL('/api/chat', OLLAMA_HOST);

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
    options: {
      temperature: 0.7,
      num_predict: 8192,
      num_ctx: 32768,
    },
  });

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let fullResponse = '';
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                fullResponse += parsed.message.content;
                if (onToken) onToken(parsed.message.content);
              }
              if (parsed.done) {
                resolve(fullResponse);
              }
            } catch (e) {
              // partial JSON, skip
            }
          }
        });

        res.on('end', () => resolve(fullResponse));
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Run a skill through Ollama
async function runSkill(skillName, userInput, onToken) {
  const systemPrompt = loadSkill(skillName);
  return ollamaChat(MODELS.mechanical, systemPrompt, userInput, onToken);
}

// Phase 3: Sincronizador — read roteiro + cenas, generate VEO3 prompts
async function runSincronizador(episodeDir, canal, estilo, onToken) {
  const roteiroPath = path.join(episodeDir, 'roteiro.md');
  const cenasPath = path.join(episodeDir, 'cenas-minutagem.md');

  if (!fs.existsSync(roteiroPath) || !fs.existsSync(cenasPath)) {
    throw new Error(`Missing roteiro.md or cenas-minutagem.md in ${episodeDir}`);
  }

  const roteiro = fs.readFileSync(roteiroPath, 'utf-8');
  const cenas = fs.readFileSync(cenasPath, 'utf-8');
  const systemPrompt = loadSkill('sincronizador');

  const userPrompt = `CANAL: ${canal}
ESTILO VISUAL: ${estilo || 'Cinematic Realism, warm Latin American tones'}

ROTEIRO:
${roteiro}

CENAS COM MINUTAGEM:
${cenas}

Generate ALL VEO 3.1 prompts synchronized with the scenes. Output ONLY the prompts, one per line.`;

  return ollamaChat(MODELS.mechanical, systemPrompt, userPrompt, onToken);
}

// Phase 6: Thumbnail prompt
async function runThumbnail(episodeDir, canal, onToken) {
  const roteiroPath = path.join(episodeDir, 'roteiro.md');
  if (!fs.existsSync(roteiroPath)) {
    throw new Error(`Missing roteiro.md in ${episodeDir}`);
  }

  const roteiro = fs.readFileSync(roteiroPath, 'utf-8').slice(0, 3000); // first 3k chars
  const systemPrompt = `You are a YouTube thumbnail prompt generator for Canal ${canal}.
Generate a photorealistic thumbnail prompt for Ideogram with:
- Elderly Latin American woman matching the story
- Face well-lit, left side, text space on right
- Bold text overlay: white (setup) + yellow #FFD700 (bridge) + red #FF2020 (impact)
- 16:9, cinematic, warm tones
- Use one of 6 templates: T1(close-up), T2(rosto+cenário), T3(perfil), T4(duas pessoas), T5(low angle), T6(sussurrando)
Output ONLY the prompt text.`;

  return ollamaChat(MODELS.mechanical, systemPrompt, `Story summary:\n${roteiro}`, onToken);
}

// Check if Ollama is running
async function checkOllama() {
  return new Promise((resolve) => {
    const parsedUrl = new URL(OLLAMA_HOST);
    const req = http.request(
      { hostname: parsedUrl.hostname, port: parsedUrl.port, path: '/', method: 'GET', timeout: 3000 },
      (res) => resolve({ online: true, status: res.statusCode })
    );
    req.on('error', () => resolve({ online: false }));
    req.on('timeout', () => { req.destroy(); resolve({ online: false }); });
    req.end();
  });
}

// List available models
async function listModels() {
  return new Promise((resolve) => {
    const parsedUrl = new URL(OLLAMA_HOST);
    const req = http.request(
      { hostname: parsedUrl.hostname, port: parsedUrl.port, path: '/api/tags', method: 'GET', timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.models || []);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.end();
  });
}

module.exports = { runSkill, runSincronizador, runThumbnail, checkOllama, listModels, MODELS, ollamaChat };
