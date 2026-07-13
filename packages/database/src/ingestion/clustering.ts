export function getTokens(text: string): string[] {
  if (!text) return [];
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

export function calculateJaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersectionCount = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = set1.size + set2.size - intersectionCount;
  return intersectionCount / unionCount;
}
