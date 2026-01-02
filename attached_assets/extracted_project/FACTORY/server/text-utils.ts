export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0400-\u04FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function transliterateRuToEn(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  
  return text.split('').map(char => {
    const lower = char.toLowerCase();
    if (map[lower]) {
      return char === lower ? map[lower] : map[lower].toUpperCase();
    }
    return char;
  }).join('');
}

export function extractNGrams(text: string, n: number = 4): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(w => w.length > 0);
  const ngrams = new Set<string>();
  
  for (let i = 0; i <= words.length - n; i++) {
    const ngram = words.slice(i, i + n).join(' ');
    ngrams.add(ngram);
  }
  
  return ngrams;
}

export function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 0;
  
  const arr1 = Array.from(set1);
  const arr2 = Array.from(set2);
  const intersection = arr1.filter(x => set2.has(x));
  const union = Array.from(new Set([...arr1, ...arr2]));
  
  return intersection.length / union.length;
}

export function computeTextSimilarity(text1: string, text2: string, ngramSize: number = 4): number {
  const ngrams1 = extractNGrams(text1, ngramSize);
  const ngrams2 = extractNGrams(text2, ngramSize);
  return jaccardSimilarity(ngrams1, ngrams2);
}

export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(w => w.length > 3);
  
  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'have', 'were', 'they', 'been', 'will',
    'more', 'when', 'which', 'their', 'what', 'about', 'into', 'than', 'only',
    'это', 'этот', 'который', 'быть', 'мочь', 'свой', 'весь', 'наш', 'очень',
    'такой', 'который', 'также', 'после', 'через', 'между', 'перед'
  ]);
  
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    if (!stopWords.has(word)) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}
