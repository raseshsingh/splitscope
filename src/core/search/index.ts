import type { NormalizedExperiment } from '../model';

export interface SearchHit { experiment: NormalizedExperiment; score: number; matchedVariationId?: string; matchedVariationName?: string }

export function searchExperiments(experiments: NormalizedExperiment[], query: string): SearchHit[] {
  const needle = normalize(query.trim());
  if (!needle) return experiments.map((experiment) => ({ experiment, score: 100 }));
  const hits: SearchHit[] = [];
  for (const experiment of experiments) {
    const exactFields = [experiment.id, experiment.campaignId].filter(Boolean).map(String);
    const exactVariation = experiment.variations.find((variation) => variation.id.toLowerCase() === needle);
    const fields = [experiment.name, experiment.id, experiment.campaignId, experiment.platform, ...experiment.variations.flatMap((variation) => [variation.name, variation.id])].filter(Boolean).map((item) => normalize(String(item)));
    let score = 0;
    if (exactFields.some((field) => normalize(field) === needle) || exactVariation) score = 1000;
    else if (exactFields.some((field) => normalize(field).startsWith(needle))) score = 700;
    else if (fields.some((field) => field.split(/\s+/).some((word) => word.startsWith(needle)))) score = 450;
    else if (fields.some((field) => field.includes(needle))) score = 250;
    else if (needle.length >= 5 && fields.some((field) => field.split(/\s+/).some((word) => editDistanceAtMostOne(word, needle)))) score = 100;
    if (score) hits.push({ experiment, score, matchedVariationId: exactVariation?.id, matchedVariationName: exactVariation?.name });
  }
  return hits.sort((a, b) => b.score - a.score || a.experiment.name.localeCompare(b.experiment.name));
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}
