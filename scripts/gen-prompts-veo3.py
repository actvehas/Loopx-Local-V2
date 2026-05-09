#!/usr/bin/env python3
"""
Gerador de prompts VEO 3.1 — lê cenas-minutagem.md e gera prompts sincronizados.
Substitui o Claude CLI sincronizador para episódios grandes (500+ cenas).
"""

import re
import sys
import os

STYLE = "Cinematic Realism warm tones"
SAFETY = "No Blood, No Nudity, No Dialogue, No Music"

# ═══════════════════════════════════════
# IDENTITY BLOCKS (copiados em cada prompt)
# ═══════════════════════════════════════

CHARACTERS = {
    "chelita_present": (
        "Personagem001 (a 74-year-old Mexican woman with silver-white hair pulled back in a loose bun, "
        "deep wrinkles, warm brown weathered skin, dark brown eyes, small gold earrings, simple blue cotton dress, "
        "brown leather sandals, a thin gold chain with a small cross)"
    ),
    "chelita_flashback": (
        "Personagem001 (a 72-year-old Mexican woman with silver-white hair in a loose bun, deep wrinkles, "
        "warm brown weathered skin, dark brown eyes, small gold earrings, simple cotton housedress with floral pattern "
        "and a white apron, brown leather sandals)"
    ),
    "don_teo": (
        "Personagem002 (an 83-year-old Mexican man, thin but wiry with strong forearms, enormous calloused hands, "
        "dark eyes the color of black coffee, red paliacate bandana tied on his forehead, faded denim jeans covered "
        "in sawdust, simple beige work shirt with rolled sleeves, brown leather work boots)"
    ),
    "patricia": (
        "Personagem003 (a 53-year-old Mexican-American woman, stern determined face, dark hair in a practical ponytail, "
        "wearing a supermarket uniform polo shirt, expressive hands that gesture when upset, medium build)"
    ),
    "sofia": (
        "Personagem004 (a 19-year-old Mexican-American girl, long dark hair, modern casual clothes — jeans and t-shirt, "
        "warm knowing smile, bright curious eyes, laptop or phone always nearby)"
    ),
    "dona_meche": (
        "Personagem005 (a 70-year-old Mexican woman from Chihuahua, round face, loud expressive personality, "
        "silver hair in a short perm, floral blouse, reading glasses on a chain around her neck)"
    ),
    "dona_gloria": (
        "Personagem006 (a 70-year-old Mexican woman from Sonora, sharp observant eyes, hair dyed dark with grey roots, "
        "always near a window, cotton housedress, arms crossed in judgment)"
    ),
    "ricardo": (
        "Personagem007 (a 55-year-old Mexican-American man, mechanic's build, calm quiet demeanor, "
        "often wearing a flannel shirt, grease-stained hands, receding hairline)"
    ),
}

# ═══════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════

SETTINGS = {
    "living_room": "a modest warm living room in Boyle Heights with afternoon sunlight streaming through lace curtains, religious images on the wall, a worn floral sofa, crochet doilies on armrests, warm amber tones",
    "boyle_heights": "a sun-drenched residential street in Boyle Heights East Los Angeles, colorful houses, Spanish-language signs, warm afternoon light, palm trees in the background",
    "don_teo_patio": "a backyard in Boyle Heights filled with stacked chopped firewood logs of oak and pine, sawdust covering the ground, an old wooden workbench, warm golden hour light filtering through wooden fence slats",
    "cobertizo": "a large wooden shed filled floor to ceiling with perfectly stacked oak logs, sawdust floating in light beams from a gap in the tin roof, an axe leaning against the wall, hundreds of tally marks carved into the back wooden wall, warm amber light",
    "don_teo_kitchen": "a small clean kitchen with blue peltre coffee pot on stove, a beautiful handmade wooden table with perfect joints, afternoon light through a small window, a black and white photo of a woman on a shelf",
    "patricia_kitchen": "a modest converted garage kitchen in Boyle Heights, fluorescent light, small table, a clock ticking on the wall, night time",
    "church": "interior of a modest Catholic church in Boyle Heights, wooden pews, candles, warm light through stained glass, a priest at the altar",
    "market": "a busy street market on Cesar Chavez Boulevard in East LA, tortilla stands, fruit vendors, colorful awnings, morning light",
    "altar_muertos": "a beautiful Dia de los Muertos altar with bright orange cempasuchil marigolds, lit candles, photos in frames, pan de muerto, a small hand-carved wooden guitar, warm candlelight glow in an outdoor patio surrounded by firewood"
}

# ═══════════════════════════════════════
# KEYWORD → SCENE TYPE + SETTING + CHARACTER MAPPING
# ═══════════════════════════════════════

def classify_scene(num, total, text):
    """Classify scene as A (avatar), B (flashback), or C (cutaway) based on content + rotation rules."""
    text_lower = text.lower()

    # Opening: first 5 scenes are A A A A B
    if num <= 4:
        return "A"
    if num == 5:
        return "B"

    # Closing: last 15 scenes are A
    if num > total - 15:
        return "A"

    # CTA scenes (like, subscribe, whatsapp) → A (avatar)
    cta_words = ["like", "suscríbete", "suscribete", "campanita", "whatsapp", "comentarios", "enlace", "descripción"]
    if any(w in text_lower for w in cta_words):
        return "A"

    # Cutaway triggers → C
    cutaway_words = ["manos", "hacha", "café", "leña", "aserrín", "tronco", "madera", "tamales", "pozole", "comida",
                     "geranios", "foto", "rosario", "reloj", "celular", "mensaje"]
    # Only cutaway if no character is speaking/acting
    dialogue_markers = ['"', "dijo", "pregunt", "contest", "grit", "llor", "ri"]
    has_dialogue = any(m in text_lower for m in dialogue_markers)

    if not has_dialogue and any(w in text_lower for w in cutaway_words):
        # Every 4th potential cutaway actually becomes cutaway (not too many)
        if num % 4 == 0:
            return "C"

    # Avatar every ~5 flashbacks (minimum 20% avatar in body)
    if num % 6 == 0:
        return "A"

    # Default: flashback
    return "B"


def get_setting(text):
    """Determine setting based on scene text content."""
    text_lower = text.lower()

    if any(w in text_lower for w in ["cobertizo", "marcas", "pared del fondo", "montaña de troncos"]):
        return SETTINGS["cobertizo"]
    if any(w in text_lower for w in ["hacha", "patio", "leña", "tronco", "corta"]):
        return SETTINGS["don_teo_patio"]
    if any(w in text_lower for w in ["cocina de don teo", "mesita de madera", "café de olla", "peltre"]):
        return SETTINGS["don_teo_kitchen"]
    if any(w in text_lower for w in ["patricia me", "mamá!", "corriendo", "garaje", "enojad"]):
        return SETTINGS["patricia_kitchen"]
    if any(w in text_lower for w in ["misa", "iglesia", "padre benito", "rosario", "parroqui"]):
        return SETTINGS["church"]
    if any(w in text_lower for w in ["mercado", "tortillería", "tortilleria", "elote"]):
        return SETTINGS["market"]
    if any(w in text_lower for w in ["altar", "cempasúchil", "cempasuchil", "muerto", "velador"]):
        return SETTINGS["altar_muertos"]
    if any(w in text_lower for w in ["calle lorena", "boyle heights", "camin", "esquina", "cuadra"]):
        return SETTINGS["boyle_heights"]

    return SETTINGS["living_room"]  # default for avatar/narration


def get_characters(text, scene_type):
    """Determine which characters appear based on text content."""
    text_lower = text.lower()
    chars = []

    if scene_type == "A":
        chars.append(CHARACTERS["chelita_present"])
        return chars

    if scene_type == "C":
        return []  # No characters in cutaway

    # Flashback — determine who's in scene
    if any(w in text_lower for w in ["don teo", "teodoro", "viejo", "hacha", "señor de 8", "ochenta"]):
        chars.append(CHARACTERS["don_teo"])
    if any(w in text_lower for w in ["chelita", "yo ", "me ", "mis ", "mi "]):
        chars.append(CHARACTERS["chelita_flashback"])
    if any(w in text_lower for w in ["patricia", "paty", "hija"]) and "hijas" not in text_lower:
        chars.append(CHARACTERS["patricia"])
    if any(w in text_lower for w in ["sofía", "sofia", "nieta"]):
        chars.append(CHARACTERS["sofia"])
    if any(w in text_lower for w in ["doña meche", "meche"]):
        chars.append(CHARACTERS["dona_meche"])
    if any(w in text_lower for w in ["doña gloria", "gloria", "ventana"]) and "gloria de" not in text_lower:
        chars.append(CHARACTERS["dona_gloria"])
    if any(w in text_lower for w in ["ricardo"]):
        chars.append(CHARACTERS["ricardo"])

    # Default: at least Chelita in flashback
    if not chars:
        chars.append(CHARACTERS["chelita_flashback"])

    return chars


def get_shot_type(num):
    """Rotate shot types to avoid repetition."""
    shots = [
        "Medium shot",
        "Close-up",
        "Wide establishing shot",
        "Over-the-shoulder shot",
        "Medium close-up",
        "Low angle shot",
        "Tracking shot following",
        "Close-up detail",
        "Wide shot",
        "Medium shot from the side",
    ]
    return shots[num % len(shots)]


def get_action(text, scene_type):
    """Generate action description based on scene text."""
    text_lower = text.lower()

    if scene_type == "A":
        # Avatar actions
        actions = [
            "looking directly at camera with warm knowing eyes, gesturing gently with one hand as she tells her story",
            "leaning forward slightly toward camera, eyes bright with emotion, hands clasped together on her lap",
            "touching her chest with one hand, eyes glistening with memory, a soft smile forming on her lips",
            "shaking her head slowly with a mix of disbelief and wonder, one hand raised palm up",
            "pausing mid-sentence, looking down at her hands in her lap, then back up at camera with watery eyes",
            "laughing softly, covering her mouth with one hand, eyes crinkling with genuine joy",
            "wiping a tear from her cheek with the back of her hand, then taking a deep breath and continuing",
        ]
        return actions[hash(text) % len(actions)]

    if scene_type == "C":
        # Cutaway actions
        if "hacha" in text_lower or "corta" in text_lower:
            return "An axe blade splitting a thick oak log in half in one clean strike, sawdust exploding in slow motion, warm golden backlight"
        if "café" in text_lower:
            return "Dark coffee being poured from a blue peltre pot into a clay mug, steam rising in golden afternoon light, cinnamon stick visible"
        if "tamales" in text_lower or "pozole" in text_lower or "comida" in text_lower:
            return "Hands wrapping tamales in corn husks on a kitchen counter, steam rising, warm overhead light"
        if "leña" in text_lower or "tronco" in text_lower:
            return "Close-up of enormous calloused hands stacking freshly chopped oak logs, sawdust on fingers, golden light"
        if "marcas" in text_lower or "pared" in text_lower:
            return "Slow pan across hundreds of tally marks carved into a wooden wall, golden light from a roof gap illuminating the marks like fire"
        if "manos" in text_lower:
            return "Two pairs of hands — one old and calloused, one smaller and weathered — touching gently over a wooden surface"
        if "foto" in text_lower or "carmela" in text_lower:
            return "A faded black and white photograph of a beautiful young Mexican woman in a frame on a wooden shelf, a single candle burning beside it"
        if "celular" in text_lower or "mensaje" in text_lower:
            return "Close-up of an old phone screen showing a text message, elderly fingers hovering over the keyboard, warm lamp light"
        if "rosario" in text_lower:
            return "Weathered hands holding a wooden rosary, fingers moving bead by bead, soft candlelight"
        return "Close-up of wood grain on a handmade table, afternoon light revealing the perfect joints and smooth surface"

    # Flashback — context-based actions
    if "abrí" in text_lower or "puerta" in text_lower or "portón" in text_lower:
        return "pushing open an old wooden gate that creaks, sunlight flooding through the gap, sawdust visible in the air"
    if "hacha" in text_lower and "enseñ" in text_lower:
        return "standing behind her with his large hands gently placed over hers on the axe handle, both looking down at a log on a tree stump, intimate teaching moment"
    if "llorando" in text_lower or "lágrimas" in text_lower or "lloré" in text_lower:
        return "with tears rolling down weathered cheeks, not wiping them away, looking at something with profound emotion"
    if "abrazó" in text_lower or "abrazo" in text_lower:
        return "embracing tightly, her face pressed against his chest, his large hands on her back, golden afternoon light"
    if "mano" in text_lower and ("tomó" in text_lower or "agarr" in text_lower):
        return "reaching out and gently taking her hand, their fingers interlacing slowly, both looking at their joined hands"
    if "enojad" in text_lower or "grit" in text_lower or "ultimátum" in text_lower:
        return "standing with arms crossed, jaw tight, eyes red, speaking forcefully with sharp hand gestures"
    if "camin" in text_lower or "calle" in text_lower:
        return "walking down a sun-drenched sidewalk carrying a cloth-wrapped dish, purposeful stride, warm afternoon light"
    if "cocin" in text_lower or "limpi" in text_lower:
        return "scrubbing a kitchen counter vigorously, sleeves rolled up, determination in every movement, clean surfaces gleaming"
    if "sentado" in text_lower or "sentamos" in text_lower or "sentarse" in text_lower:
        return "sitting side by side on a small wooden bench, shoulders touching, looking straight ahead in comfortable silence, golden hour light"
    if "altar" in text_lower or "muerto" in text_lower:
        return "standing before a Dia de los Muertos altar covered in orange marigolds and lit candles, faces illuminated by warm candlelight, hand in hand"

    return "in a warm naturally lit scene, moving with quiet purpose, ambient Boyle Heights atmosphere"


def generate_prompt(num, total, text):
    """Generate a single VEO 3.1 prompt for a scene."""
    scene_type = classify_scene(num, total, text)
    setting = get_setting(text)
    characters = get_characters(text, scene_type)
    shot = get_shot_type(num)
    action = get_action(text, scene_type)

    char_block = " and ".join(characters) if characters else ""

    if scene_type == "C":
        prompt = f"(Cena {num:03d})[{STYLE}, {SAFETY}] {shot} of {action}, set in {setting}. Photorealistic, shallow depth of field, 8K detail."
    elif scene_type == "A":
        prompt = f"(Cena {num:03d})[{STYLE}, {SAFETY}] {shot} of {char_block} {action}, set in {setting}. Natural window lighting, intimate documentary feel, shallow depth of field."
    else:
        prompt = f"(Cena {num:03d})[{STYLE}, {SAFETY}] {shot} of {char_block} {action}, set in {setting}. Warm desaturated amber tones like aged analog film, natural lighting only, film grain texture."

    return prompt


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 gen-prompts-veo3.py <cenas-minutagem.md> [output.md]")
        sys.exit(1)

    cenas_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else cenas_path.replace("cenas-minutagem.md", "prompts-veo3.md")

    with open(cenas_path, 'r') as f:
        content = f.read()

    # Parse scenes
    pattern = r'Cena (\d+) \(([^)]+)\): "([^"]*)"'
    scenes = re.findall(pattern, content)

    if not scenes:
        print("❌ Nenhuma cena encontrada")
        sys.exit(1)

    total = len(scenes)
    print(f"📝 {total} cenas encontradas")

    # Generate prompts
    prompts = []
    type_counts = {"A": 0, "B": 0, "C": 0}

    for num_str, timing, text in scenes:
        num = int(num_str)
        prompt = generate_prompt(num, total, text)
        scene_type = classify_scene(num, total, text)
        type_counts[scene_type] += 1
        prompts.append(prompt)

    # Write output
    with open(output_path, 'w') as f:
        f.write(f"# Prompts VEO 3.1 — Roteiro 21\n")
        f.write(f"# Total: {total} prompts | A(avatar): {type_counts['A']} | B(flashback): {type_counts['B']} | C(cutaway): {type_counts['C']}\n")
        f.write(f"# Gerado automaticamente por gen-prompts-veo3.py\n\n")
        for p in prompts:
            f.write(p + "\n")

    pct_a = type_counts['A'] / total * 100
    pct_b = type_counts['B'] / total * 100
    pct_c = type_counts['C'] / total * 100

    print(f"✅ {total} prompts gerados → {output_path}")
    print(f"   Avatar (A): {type_counts['A']} ({pct_a:.0f}%)")
    print(f"   Flashback (B): {type_counts['B']} ({pct_b:.0f}%)")
    print(f"   Cutaway (C): {type_counts['C']} ({pct_c:.0f}%)")


if __name__ == "__main__":
    main()
