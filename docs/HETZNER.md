# Hetzner — Servidor de Montagem

Servidor dedicado onde roda a Fase 5 (montagem FFmpeg/Remotion).

## Specs

| Componente | Valor |
|-----------|-------|
| **Modelo** | Hetzner AX41-NVMe |
| **IP** | 65.109.85.250 |
| **User** | root |
| **OS** | Ubuntu 24.04.4 LTS (Noble Numbat) |
| **CPU** | AMD Ryzen 5 3600 — 6 cores / 12 threads @ 3.6GHz |
| **RAM** | 64GB DDR4 |
| **Disco** | 512GB NVMe (RAID1, 461GB úteis) |
| **GPU** | Nenhuma (montagem é CPU-bound via FFmpeg) |
| **Custo** | €51/mês |

## Software instalado

| Software | Versão |
|---------|--------|
| FFmpeg | 6.1.1 |
| Node.js | 20.20.1 |
| npm | 10.8.2 |
| Python | 3.12.3 |
| PM2 | 6.0.14 |

## Acesso

```bash
ssh root@65.109.85.250
```

Cada máquina (Mac, Windows) tem o seu vault Obsidian **independente** — não há sincronização entre eles. Cada pessoa trabalha nos seus canais no seu vault local.

SSH key necessária. Adicionar a chave pública da máquina em:
```
/root/.ssh/authorized_keys
```

## Estrutura do LoopX Local na Hetzner

```
/root/loopx-local/
├── assembly/           # Script de montagem FFmpeg
├── jobs/               # Assets recebidos via rsync
│   └── CANAL/NN/       # Ex: E/16/ com Cenas/ + audio.wav + audio.srt
├── output/             # Vídeos montados
└── config.json         # Configuração (R2 keys, etc)
```

**IMPORTANTE:** Esta pasta é SEPARADA do `/root/LoopX/` (SaaS dashboard).

## O que já existe na Hetzner (LoopX SaaS)

O servidor também roda os workers do LoopX SaaS (projeto separado):

```
/root/LoopX/                    # Dashboard SaaS (NÃO MEXER)
├── workers/
│   ├── assembly-worker.ts      # Worker BullMQ de montagem
│   ├── assembler.ts            # FFmpeg pipeline (1543 linhas)
│   ├── remotion-chunker.ts     # Divide vídeos longos em chunks 10min
│   ├── loopx-worker.ts         # Maestro
│   ├── visual-worker.ts        # B-roll VEO3 + imagens
│   ├── tts-worker.ts           # AI33.pro TTS
│   └── ...
└── src/remotion/               # Componentes Remotion
    ├── Root.tsx
    ├── CinematicComposition.tsx
    ├── AudiogramSubtitles.tsx
    ├── KenBurnsImage.tsx
    └── TransitionFade.tsx
```

PM2 processes (SaaS — já rodando):
```
loopx-maestro           — orchestrador
loopx-visual-worker     — b-roll
loopx-tts-worker        — TTS cloud
loopx-assembly-worker   — montagem FFmpeg
```

## Capacidade

- **FFmpeg encode**: H264 libx264, CRF 18, ~10-30 min por vídeo de 1h
- **RAM livre**: ~60GB disponíveis (workers SaaS usam ~400MB)
- **Disco livre**: ~425GB (sobra pra vários jobs simultâneos)
- **Sem GPU**: montagem é 100% CPU — Ryzen 5 3600 dá conta

## Enviar assets pra Hetzner

### Desde Mac
```bash
rsync -avz --progress ./Cenas/ root@65.109.85.250:/root/loopx-local/jobs/E/16/Cenas/
rsync -avz --progress audio.wav audio.srt root@65.109.85.250:/root/loopx-local/jobs/E/16/
```

### Desde Windows (via scp)
```powershell
scp -r .\Cenas\ root@65.109.85.250:/root/loopx-local/jobs/E/16/Cenas/
scp audio.wav audio.srt root@65.109.85.250:/root/loopx-local/jobs/E/16/
```

## Baixar vídeo final

```bash
# Mac
rsync -avz root@65.109.85.250:/root/loopx-local/jobs/E/16/final.mp4 ./

# Windows
scp root@65.109.85.250:/root/loopx-local/jobs/E/16/final.mp4 .\
```
