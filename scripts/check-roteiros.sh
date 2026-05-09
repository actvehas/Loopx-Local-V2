#!/bin/bash
# check-roteiros.sh — Auditoria automática anti-massa para Canal I (Fe al Descubierto)
# Roda ANTES de escrever cada roteiro novo. Falha se detectar repetição.
#
# Uso:
#   bash scripts/check-roteiros.sh
#   bash scripts/check-roteiros.sh /path/to/novo-roteiro.md  (também checa o novo contra os anteriores)

set -e

CANAL_DIR="$HOME/Documents/Obsidian Vault/Projetos/Meus Canais/Fe al Descubierto"
NOVO="$1"

echo "════════════════════════════════════════════════"
echo "🔍 ANTI-MASSA CHECK — Fe al Descubierto"
echo "════════════════════════════════════════════════"
echo ""

# Coletar todos os roteiros existentes (excluir _archive_v1)
ROTEIROS=$(find "$CANAL_DIR" -maxdepth 3 -name "roteiro.md" -not -path "*_archive*" 2>/dev/null | sort)
N=$(echo "$ROTEIROS" | wc -l | tr -d ' ')

echo "📂 Roteiros encontrados: $N"
echo "$ROTEIROS" | while read -r r; do
    [ -n "$r" ] && echo "   - $(basename "$(dirname "$r")")"
done
echo ""

# ── 1. Frases proibidas (já apareceram em 2+ vídeos) ───────────────
echo "── 1. FRASES PROIBIDAS ─────────────────────────"
BANIDAS=(
    "Sé que es difícil de oír"
    "no es culpa tuya"
    "hoy te voy a mostrar"
    "La Biblia dice exactamente lo contrario"
    "Si este mensaje te tocó"
    "déjalo saber en los comentarios"
    "cuéntame cuál de"
    "Que Dios te bendiga"
    "Hasta el próximo mensaje"
    "Esa frase no está en la Biblia"
    "Es uno de los engaños"
    "ya sabes la verdad"
)
HITS_TOTAL=0
for frase in "${BANIDAS[@]}"; do
    COUNT=0
    while read -r r; do
        [ -z "$r" ] && continue
        if grep -qiF "$frase" "$r"; then
            COUNT=$((COUNT + 1))
        fi
    done <<< "$ROTEIROS"
    if [ "$COUNT" -ge 2 ]; then
        echo "   ⚠️  '$frase' aparece em $COUNT roteiros — BANIDA"
        HITS_TOTAL=$((HITS_TOTAL + 1))
    fi
done
[ "$HITS_TOTAL" -eq 0 ] && echo "   ✅ nenhuma frase banida ativa"
echo ""

# ── 2. Personagens / archetypes ──────────────────────
echo "── 2. PERSONAGENS USADOS ───────────────────────"
NOMES=$(grep -hoE 'Doña [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|Don [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+' $ROTEIROS 2>/dev/null | sort -u)
echo "$NOMES" | sed 's/^/   /'
DONA_COUNT=$(echo "$NOMES" | grep -c "^Doña" || true)
DON_COUNT=$(echo "$NOMES" | grep -c "^Don " || true)
echo ""
echo "   Doña X: $DONA_COUNT"
echo "   Don X:  $DON_COUNT"
[ "$DONA_COUNT" -ge 5 ] && echo "   🚨 ARCHETYPE 'Doña X' atingiu cap — não usar nos próximos 3 vídeos"
[ "$DON_COUNT" -ge 5 ] && echo "   🚨 ARCHETYPE 'Don X' atingiu cap — não usar nos próximos 3 vídeos"
echo ""

# ── 3. Versículos já usados ───────────────────────────
echo "── 3. VERSÍCULOS JÁ CITADOS (não repetir) ──────"
VERSOS=$(grep -hoE '(Génesis|Éxodo|Levítico|Números|Deuteronomio|Josué|Jueces|Rut|Samuel|Reyes|Crónicas|Esdras|Nehemías|Ester|Job|Salmo|Proverbios|Eclesiastés|Cantares|Isaías|Jeremías|Lamentaciones|Ezequiel|Daniel|Oseas|Joel|Amós|Abdías|Jonás|Miqueas|Nahúm|Habacuc|Sofonías|Hageo|Zacarías|Malaquías|Mateo|Marcos|Lucas|Juan|Hechos|Romanos|Corintios|Gálatas|Efesios|Filipenses|Colosenses|Tesalonicenses|Timoteo|Tito|Filemón|Hebreos|Santiago|Pedro|Apocalipsis) [Cc]apítulo? ?[0-9]+,? ?versículos? ?[0-9]+(-[0-9]+| y [0-9]+)?' $ROTEIROS 2>/dev/null | sort -u)
echo "$VERSOS" | sed 's/^/   /'
COUNT_V=$(echo "$VERSOS" | grep -c '.' || true)
echo ""
echo "   Total versículos já usados: $COUNT_V"
echo ""

# ── 4. Word count / FORMATO ───────────────────────────
echo "── 4. WORD COUNT POR ROTEIRO ───────────────────"
while read -r r; do
    [ -z "$r" ] && continue
    WC=$(wc -w < "$r" | tr -d ' ')
    NAME=$(basename "$(dirname "$r")")
    echo "   $NAME → $WC palavras"
done <<< "$ROTEIROS"
echo ""

# ── 5. Estrutura "X tenía Y años" (mass-produced flag) ─
echo "── 5. PADRÃO 'X tenía Y años' ──────────────────"
FORMULA=$(grep -hoE '[A-Z][a-záéíóú]+ tenía [0-9]+ años' $ROTEIROS 2>/dev/null | sort | uniq -c | sort -rn)
if [ -n "$FORMULA" ]; then
    echo "$FORMULA" | sed 's/^/   /'
    LINHAS=$(echo "$FORMULA" | wc -l | tr -d ' ')
    [ "$LINHAS" -ge 5 ] && echo "   🚨 fórmula 'X tenía Y años' usada $LINHAS vezes — variar nos próximos"
fi
echo ""

# ── 6. Se um novo roteiro foi passado, checar contra os anteriores ─
if [ -n "$NOVO" ] && [ -f "$NOVO" ]; then
    echo "── 6. CHECK DO ROTEIRO NOVO ──────────────────"
    echo "   Arquivo: $NOVO"
    echo ""

    # Frases banidas no novo
    HITS_NOVO=0
    for frase in "${BANIDAS[@]}"; do
        if grep -qiF "$frase" "$NOVO"; then
            echo "   ⚠️  Novo roteiro contém frase banida: '$frase'"
            HITS_NOVO=$((HITS_NOVO + 1))
        fi
    done
    [ "$HITS_NOVO" -eq 0 ] && echo "   ✅ nenhuma frase banida"

    # Word count do novo
    WC_NOVO=$(wc -w < "$NOVO" | tr -d ' ')
    echo "   Word count do novo: $WC_NOVO"

    # Similaridade básica: % de linhas idênticas com algum roteiro anterior
    while read -r r; do
        [ -z "$r" ] && continue
        [ "$r" = "$NOVO" ] && continue
        IGUAIS=$(comm -12 <(sort "$NOVO") <(sort "$r") | wc -l | tr -d ' ')
        TOTAL=$(wc -l < "$NOVO" | tr -d ' ')
        [ "$TOTAL" -gt 0 ] && PCT=$((IGUAIS * 100 / TOTAL)) || PCT=0
        if [ "$PCT" -ge 5 ]; then
            echo "   🚨 $PCT% de linhas idênticas com $(basename "$(dirname "$r")")"
        fi
    done <<< "$ROTEIROS"

    # VEREDICTO
    echo ""
    if [ "$HITS_NOVO" -eq 0 ]; then
        echo "   ✅ ROTEIRO PASSOU"
    else
        echo "   ❌ ROTEIRO REPROVADO — corrigir as frases acima"
        exit 1
    fi
fi

echo ""
echo "════════════════════════════════════════════════"
echo "✅ Check concluído"
echo "════════════════════════════════════════════════"
