#!/bin/bash
# strip-captions.sh — Remove "Caption: ..." e "Spanish handwritten caption"
# de prompts-veo3.md (VEO erra texto em espanhol — usar Remotion/SRT overlay)
#
# Uso: bash strip-captions.sh /path/to/prompts-veo3.md
set -e
F="$1"
[ -z "$F" ] && { echo "Uso: $0 prompts-veo3.md"; exit 1; }

cp "$F" "$F.bak"
# Remove caption sentence and "Spanish handwritten caption..." flag from style block
python3 - "$F" << 'PYEOF'
import sys, re
path = sys.argv[1]
with open(path) as f:
    txt = f.read()

# Remove "Spanish handwritten caption..." from prompt headers
txt = re.sub(r',\s*Spanish handwritten caption[^,\]]*', '', txt)
# Remove sentence "Spanish handwritten caption ..." in style base block
txt = re.sub(r'\.?\s*Spanish handwritten caption [^.]*\.', '', txt)
# Remove "Caption: \"...\"" lines/sentences
txt = re.sub(r'\s*Caption:\s*"[^"]*"\.?', '', txt)

with open(path, 'w') as f:
    f.write(txt)
print(f"Cleaned {path}")
PYEOF
