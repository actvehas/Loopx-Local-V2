function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

export interface KenBurnsConfig {
  zoomStart: number;
  zoomEnd: number;
  panXStart: number;
  panXEnd: number;
  panYStart: number;
  panYEnd: number;
}

export function getKenBurns(sceneNum: number): KenBurnsConfig {
  const r1 = seededRandom(sceneNum);
  const r2 = seededRandom(sceneNum + 1000);
  const r3 = seededRandom(sceneNum + 2000);

  const zoomIn = r1 > 0.5;
  const zoomAmount = 1.0 + 0.05 + r2 * 0.05; // 1.05 to 1.10 — visible but smooth

  const panAmount = 0.03 + r3 * 0.04; // 3-7% — noticeable drift
  const panAngle = r1 * Math.PI * 2;

  const panXDelta = Math.cos(panAngle) * panAmount;
  const panYDelta = Math.sin(panAngle) * panAmount;

  return {
    zoomStart: zoomIn ? 1.0 : zoomAmount,
    zoomEnd: zoomIn ? zoomAmount : 1.0,
    panXStart: zoomIn ? 0 : panXDelta,
    panXEnd: zoomIn ? panXDelta : 0,
    panYStart: zoomIn ? 0 : panYDelta,
    panYEnd: zoomIn ? panYDelta : 0,
  };
}
