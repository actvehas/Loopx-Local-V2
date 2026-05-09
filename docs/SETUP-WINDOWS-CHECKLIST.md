# Setup Windows — Checklist Completo

Guia passo a passo para configurar o LoopX Local num PC Windows.

## Pré-requisitos

- Windows 10/11 (64-bit)
- Acesso à internet
- Conta GitHub com acesso ao repo (SSH key adicionada)

---

## Passo 1: Gerar SSH Key

Abrir PowerShell e rodar:
```powershell
ssh-keygen -t ed25519 -C "windows-paulo"
```
Dar Enter em tudo (aceitar defaults, sem senha).

Copiar a chave pública:
```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Enviar essa chave pra Jaci adicionar em:
- [ ] **GitHub** → https://github.com/settings/keys → "New SSH key" → Title: "Paulo Windows"
- [ ] **Hetzner** → `ssh root@65.109.85.250 "echo 'CHAVE_PUBLICA_AQUI' >> ~/.ssh/authorized_keys"`

Testar:
```powershell
ssh -T git@github.com
# Esperado: "Hi actvehas! You've successfully authenticated"

ssh root@65.109.85.250 "echo ok"
# Esperado: "ok"
```

---

## Passo 2: Clonar o repositório

```powershell
cd $env:USERPROFILE\Documents
git clone git@github.com:actvehas/LoopX-Local.git
cd LoopX-Local
```

---

## Passo 3: Rodar o instalador automático

```powershell
PowerShell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

Isto instala: Git, Node.js 20, Python 3.12, FFmpeg, PyTorch+CUDA, Whisper, Obsidian, Claude Code CLI.

**IMPORTANTE:** Fechar e reabrir o terminal depois do setup.

---

## Passo 4: Verificar instalação

Abrir novo terminal e rodar cada um:

```powershell
node --version
# Esperado: v20.x.x
```

```powershell
python --version
# Esperado: Python 3.12.x
```

```powershell
ffmpeg -version
# Esperado: ffmpeg version x.x.x
```

```powershell
whisper --help
# Esperado: mostra opções do whisper
```

```powershell
claude --version
# Esperado: versão do Claude Code
```

```powershell
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}, GPU: {torch.cuda.get_device_name(0)}')"
# Esperado: CUDA: True, GPU: NVIDIA GeForce RTX 2070
```

```powershell
ssh root@65.109.85.250 "echo ok"
# Esperado: ok
```

- [ ] node OK
- [ ] python OK
- [ ] ffmpeg OK
- [ ] whisper OK
- [ ] claude OK
- [ ] CUDA OK (RTX 2070 detectada)
- [ ] SSH Hetzner OK

---

## Passo 5: Instalar VS Code + Pixel Agents

```powershell
winget install Microsoft.VisualStudioCode
```

Depois de instalar:
1. Abrir VS Code
2. Ctrl+Shift+X (Extensions)
3. Pesquisar "Pixel Agents" → Install
4. Abrir a pasta do projeto: File → Open Folder → `Documents\LoopX-Local`

---

## Passo 6: Instalar skills do Claude Code

```powershell
Copy-Item $env:USERPROFILE\Documents\LoopX-Local\skills\*.md $env:USERPROFILE\.claude\commands\
```

Verificar:
```powershell
dir $env:USERPROFILE\.claude\commands\
```

Deve mostrar: `analista-titulos.md`, `criador-titulos.md`, `gerenteE.md`, `gerenteF.md`, `sincronizador.md`, `titulo-pipeline.md`

- [ ] Skills copiadas

---

## Passo 7: Instalar Obsidian

Se o setup automático não instalou:
```powershell
winget install Obsidian.Obsidian
```

Depois de instalar:
1. Abrir Obsidian
2. "Open folder as vault"
3. Criar/selecionar pasta: `C:\Users\{user}\Documents\Obsidian Vault`
4. Criar estrutura do primeiro canal (ver Fase 0 no README)

- [ ] Obsidian instalado e vault criado

---

## Passo 8: Instalar Chrome (se não tiver)

```powershell
winget install Google.Chrome
```

Chrome é necessário pra Fase 4 (geração de vídeos no Google Labs Flow).

- [ ] Chrome instalado

---

## Passo 9: Configurar API key do Claude Code

```powershell
claude
```

Na primeira execução, seguir o fluxo de autenticação (login com conta Anthropic ou API key).

- [ ] Claude Code autenticado

---

## Passo 10: Teste completo

Testar que o pipeline funciona rodando cada comando:

```powershell
# Verificar setup Mac/Windows
cd $env:USERPROFILE\Documents\LoopX-Local

# Testar SSH pra Hetzner
ssh root@65.109.85.250 "ls /root/loopx-local/"
# Esperado: assembly  jobs  output

# Testar Claude Code com uma skill
claude "/sincronizador"
# Esperado: Claude carrega o sincronizador
```

- [ ] Hetzner acessível
- [ ] Claude Code com skills funcionando

---

## Resumo do que ficou instalado

| Software | Versão | Pra quê |
|----------|--------|---------|
| Git | latest | Clonar repo, SSH |
| Node.js | 20 LTS | Claude Code CLI, veo3-generator |
| Python | 3.12 | TTS, Whisper |
| FFmpeg | latest | Concatenar áudio, processar vídeo |
| PyTorch + CUDA | 2.x + cu121 | Qwen3-TTS na RTX 2070 |
| Whisper | latest | Transcrição → SRT + cenas |
| VS Code | latest | Editor + Pixel Agents |
| Obsidian | latest | Vault local (filesystem dos projetos) |
| Chrome | latest | Google Labs Flow (Fase 4) |
| Claude Code | latest | Skills do pipeline (Fases 0-3) |

---

## Problemas comuns

### "CUDA: False" no teste do PyTorch
- Verificar se drivers NVIDIA estão instalados: `nvidia-smi`
- Se não estiver, baixar de https://www.nvidia.com/Download/index.aspx
- Reinstalar PyTorch: `pip install torch --index-url https://download.pytorch.org/whl/cu121`

### FFmpeg não reconhecido
- Fechar e reabrir o terminal
- Se persistir, adicionar ao PATH manualmente: Configurações → Variáveis de Ambiente → Path → adicionar caminho do FFmpeg

### SSH "Permission denied"
- Verificar se a chave pública foi adicionada no GitHub e no Hetzner
- Verificar se está usando a chave certa: `ssh -v root@65.109.85.250`

### Whisper muito lento
- Verificar se CUDA está ativo: `python -c "import torch; print(torch.cuda.is_available())"`
- Se False, Whisper roda em CPU (10x mais lento)

### Claude Code não encontra skills
- Verificar se os .md estão em `%USERPROFILE%\.claude\commands\`
- Reiniciar o Claude Code
