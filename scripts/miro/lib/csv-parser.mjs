import { readFile } from 'fs/promises';
import { parse } from 'csv-parse/sync';

const COLUMN_MAP = {
  // English
  'video': 'id',
  'video title': 'title',
  'views': 'views',
  'impressions': 'impressions',
  'impressions click-through rate (%)': 'ctr',
  'average view duration': 'avg_view_duration',
  'subscribers': 'subs_gained',
  'subscribers gained': 'subs_gained',
  'video publish time': 'published',
  // Spanish
  'título del vídeo': 'title',
  'visualizaciones': 'views',
  'impresiones': 'impressions',
  'porcentaje de clics en impresiones (%)': 'ctr',
  'porcentaje de clics de las impresiones (%)': 'ctr',
  'duración media de visualización': 'avg_view_duration',
  'duración media de las visualizaciones': 'avg_view_duration',
  'suscriptores': 'subs_gained',
  'suscriptores ganados': 'subs_gained',
  'fecha de publicación del vídeo': 'published',
};

function normalizeValue(key, value) {
  if (!value || value === '' || value === '-') return null;
  if (key === 'ctr') return parseFloat(value.replace('%', '').replace(',', '.'));
  if (key === 'views' || key === 'impressions' || key === 'subs_gained') {
    return parseInt(value.replace(/[.,\s]/g, ''), 10);
  }
  if (key === 'avg_view_duration') {
    const parts = value.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseInt(value, 10);
  }
  return value;
}

export async function parseCSV(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const delimiter = content.includes('\t') ? '\t' : ',';

  const records = parse(content, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return records.map(row => {
    const video = {};
    for (const [col, val] of Object.entries(row)) {
      const normalized = COLUMN_MAP[col.toLowerCase().trim()];
      if (normalized) {
        video[normalized] = normalizeValue(normalized, val);
      }
    }
    video.structure = null;
    video.framework = null;
    video.method_used = null;
    video.has_branding = null;
    video.source = 'csv';
    return video;
  });
}
