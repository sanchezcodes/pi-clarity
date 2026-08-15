/**
 * Deterministic bilingual presentation metrics.
 *
 * Per reports/preregistration.md §2 and research/evaluation-methods.md §8.3, presentation
 * properties that code can see are computed here and never handed to a judge. Readability
 * is scored per language against its own scale (English: Flesch; Spanish: INFLESZ), with
 * identifiers, code, URLs, paths, and proper-name-shaped tokens stripped first per
 * WCAG 2.2 SC 3.1.5. Only within-language deltas are meaningful.
 */

export type Language = "en" | "es";

export interface Readability {
  scale: "flesch-reading-ease-en" | "inflesz-es";
  score: number;
  band: string;
  gradeLevel: number | null;
  words: number;
  sentences: number;
  syllables: number;
}

export interface PresentationMetrics {
  language: Language;
  chars: number;
  words: number;
  sentences: number;
  paragraphs: number;
  sentenceWords: { mean: number; p90: number };
  paragraphWords: { mean: number; p90: number; max: number };
  headings: { count: number; maxDepth: number };
  listItemShare: number;
  codeFences: { count: number; balanced: boolean };
  answerFirst: boolean;
  acronyms: { total: number; glossed: number; glossRate: number };
  readability: Readability;
  languageFidelity: { expected: Language; detected: Language | "unknown"; ok: boolean };
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : ((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Percentage change of `value` against `base`; null when the baseline is zero. */
export function percentChange(value: number, base: number): number | null {
  return base === 0 ? null : round(((value - base) / base) * 100, 2);
}

export function parseLanguage(value: string): Language {
  return value.toLowerCase().startsWith("es") ? "es" : "en";
}

const FENCE_LINE = /^\s*(`{3,}|~{3,})/;
const HEADING_LINE = /^(#{1,6})\s+\S/;
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** Splits a response into fenced-code and prose segments without reordering content. */
export function splitCodeAndProse(text: string): { prose: string; codeBlocks: string[]; fenceCount: number; balanced: boolean } {
  const lines = splitLines(text);
  const prose: string[] = [];
  const codeBlocks: string[] = [];
  let current: string[] | null = null;
  let fenceCount = 0;
  for (const line of lines) {
    if (FENCE_LINE.test(line)) {
      fenceCount += 1;
      if (current) {
        codeBlocks.push(current.join("\n"));
        current = null;
      } else {
        current = [];
      }
      continue;
    }
    if (current) current.push(line);
    else prose.push(line);
  }
  if (current) codeBlocks.push(current.join("\n"));
  return { prose: prose.join("\n"), codeBlocks, fenceCount, balanced: fenceCount % 2 === 0 };
}

/**
 * Removes content that a readability index must not score: code, URLs, paths,
 * identifiers, numbers, and proper-name-shaped tokens (WCAG 2.2 SC 3.1.5).
 */
export function stripForReadability(text: string): string {
  const { prose } = splitCodeAndProse(text);
  return prose
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[|]/g, " ")
    .replace(/^\s*(#{1,6}|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_>~]/g, " ")
    .replace(/\S*[/\\_@]\S*/g, " ")
    .replace(/\b\w*\d\w*\b/g, " ")
    .replace(/\b[A-ZÁÉÍÓÚÑ]{2,}\b/g, " ")
    .replace(/\b[A-Za-zÁ-Úá-ú]+[A-Z][A-Za-z]*\b/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])[\s"'”’)]+|\n{2,}/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[A-Za-zÁ-Úá-úñÑ]/.test(sentence));
}

export function splitWords(text: string): string[] {
  return text.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:['’][A-Za-zÁ-Úá-ú]+)?/g) ?? [];
}

export function countSyllablesEn(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return 0;
  let count = normalized.match(/[aeiouy]+/g)?.length ?? 0;
  // Silent endings: final 'e', regular '-ed' outside t/d stems, and '-es' outside sibilants.
  if (count > 1 && /(?:[^aeiou]e|[^aeioutd]ed|[^aeiousxzh]es)$/.test(normalized)) count -= 1;
  return Math.max(1, count);
}

const STRONG_VOWELS = new Set(["a", "e", "o", "á", "é", "ó"]);
const ACCENTED_WEAK = new Set(["í", "ú"]);

export function countSyllablesEs(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  if (!normalized) return 0;
  const groups = normalized.match(/[aeiouáéíóúü]+/g) ?? [];
  let count = 0;
  for (const group of groups) {
    count += 1;
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1]!;
      const current = group[index]!;
      const hiatus = (STRONG_VOWELS.has(previous) && STRONG_VOWELS.has(current))
        || ACCENTED_WEAK.has(previous)
        || ACCENTED_WEAK.has(current);
      if (hiatus) count += 1;
    }
  }
  return Math.max(1, count);
}

function englishBand(score: number): string {
  if (score < 30) return "very_difficult";
  if (score < 50) return "difficult";
  if (score < 60) return "fairly_difficult";
  if (score < 70) return "standard";
  if (score < 80) return "fairly_easy";
  if (score < 90) return "easy";
  return "very_easy";
}

/** INFLESZ bands from Barrio-Cantalejo et al. (2008); Spanish texts target > 55. */
function infleszBand(score: number): string {
  if (score < 40) return "muy_dificil";
  if (score < 55) return "algo_dificil";
  if (score < 65) return "normal";
  if (score < 80) return "bastante_facil";
  return "muy_facil";
}

export function computeReadability(text: string, language: Language): Readability {
  const cleaned = stripForReadability(text);
  const sentences = splitSentences(cleaned);
  const words = splitWords(cleaned);
  const countSyllables = language === "es" ? countSyllablesEs : countSyllablesEn;
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const base = {
    words: words.length,
    sentences: sentences.length,
    syllables,
  };
  if (!words.length || !sentences.length) {
    return language === "es"
      ? { scale: "inflesz-es", score: 0, band: "unscored", gradeLevel: null, ...base }
      : { scale: "flesch-reading-ease-en", score: 0, band: "unscored", gradeLevel: null, ...base };
  }
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  if (language === "es") {
    // Flesch-Szigriszt perspicuity, read against the INFLESZ scale.
    const score = 206.835 - 62.3 * syllablesPerWord - wordsPerSentence;
    return { scale: "inflesz-es", score: round(score, 2), band: infleszBand(score), gradeLevel: null, ...base };
  }
  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const gradeLevel = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  return {
    scale: "flesch-reading-ease-en",
    score: round(score, 2),
    band: englishBand(score),
    gradeLevel: round(gradeLevel, 2),
    ...base,
  };
}

const PREAMBLE_PATTERNS = [
  /^(sure|certainly|absolutely|of course|great question|good question|happy to help|i'?d be happy|let'?s (start|dive|take|walk)|here'?s (a|the|what|how)|below (is|you)|in this (response|answer)|i'?ll (explain|walk|start)|thanks for)/i,
  /^(claro|por supuesto|desde luego|buena pregunta|con gusto|encantad|vamos a|a continuación|en esta respuesta|te explico|aquí (tienes|va)|gracias por)/i,
];

/** True when the response opens with substance rather than a preamble or bare heading. */
export function detectAnswerFirst(text: string): boolean {
  const { prose } = splitCodeAndProse(text);
  const blocks = prose.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const firstContent = lines.find((line) => !HEADING_LINE.test(line));
    if (!firstContent) continue;
    const sentence = splitSentences(firstContent.replace(LIST_LINE, "").replace(/[*_`#>]/g, ""))[0] ?? firstContent;
    return !PREAMBLE_PATTERNS.some((pattern) => pattern.test(sentence.trim()));
  }
  return false;
}

/** Share of unique acronyms glossed at first use, either `TERM (expansion)` or `expansion (TERM)`. */
export function acronymGlossing(text: string): { total: number; glossed: number; glossRate: number } {
  const { prose } = splitCodeAndProse(text);
  const withoutInline = prose.replace(/`[^`\n]*`/g, " ");
  const acronyms = [...new Set(withoutInline.match(/\b[A-Z]{2,6}\b/g) ?? [])];
  let glossed = 0;
  for (const acronym of acronyms) {
    const escaped = acronym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const glossedAfter = new RegExp(`\\b${escaped}\\b\\s*[(（][^)）]{3,}[)）]`).test(withoutInline);
    const glossedBefore = new RegExp(`[A-Za-zÁ-Úá-ú]{3,}[^.\\n]{0,80}?[(（]\\s*${escaped}\\s*[)）]`).test(withoutInline);
    if (glossedAfter || glossedBefore) glossed += 1;
  }
  return {
    total: acronyms.length,
    glossed,
    glossRate: acronyms.length ? round(glossed / acronyms.length) : 1,
  };
}

const ES_MARKERS = /\b(el|la|los|las|de|del|que|para|con|una|por|como|más|pero|se|su|es|son|también|puede|cuando|donde)\b/gi;
const EN_MARKERS = /\b(the|of|and|to|that|for|with|this|is|are|you|it|can|when|where|which|from|but|also)\b/gi;

/** Coarse language check: Spanish cases must be answered in Spanish (preregistration §4.1). */
export function detectLanguage(text: string): Language | "unknown" {
  const { prose } = splitCodeAndProse(text);
  const spanish = (prose.match(ES_MARKERS) ?? []).length + (prose.match(/[áéíóúñ¿¡]/gi) ?? []).length;
  const english = (prose.match(EN_MARKERS) ?? []).length;
  if (spanish === 0 && english === 0) return "unknown";
  if (spanish > english) return "es";
  if (english > spanish) return "en";
  return "unknown";
}

export function computePresentationMetrics(text: string, languageValue: string): PresentationMetrics {
  const language = parseLanguage(languageValue);
  const { prose, fenceCount, balanced } = splitCodeAndProse(text);
  const proseLines = splitLines(prose);
  const contentLines = proseLines.filter((line) => line.trim().length > 0);
  const headingLines = contentLines.filter((line) => HEADING_LINE.test(line.trim()));
  const listLines = contentLines.filter((line) => LIST_LINE.test(line));
  const maxDepth = headingLines.reduce((depth, line) => {
    const match = HEADING_LINE.exec(line.trim());
    return Math.max(depth, match?.[1]?.length ?? 0);
  }, 0);

  const cleaned = stripForReadability(text);
  const sentences = splitSentences(cleaned);
  const sentenceWordCounts = sentences.map((sentence) => splitWords(sentence).length).filter((count) => count > 0);
  const paragraphs = prose
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !HEADING_LINE.test(paragraph));
  const paragraphWordCounts = paragraphs.map((paragraph) => splitWords(paragraph).length);
  const detected = detectLanguage(text);

  return {
    language,
    chars: text.length,
    words: splitWords(cleaned).length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    sentenceWords: {
      mean: round(mean(sentenceWordCounts), 2),
      p90: round(percentile(sentenceWordCounts, 0.9), 2),
    },
    paragraphWords: {
      mean: round(mean(paragraphWordCounts), 2),
      p90: round(percentile(paragraphWordCounts, 0.9), 2),
      max: paragraphWordCounts.length ? Math.max(...paragraphWordCounts) : 0,
    },
    headings: { count: headingLines.length, maxDepth },
    listItemShare: contentLines.length ? round(listLines.length / contentLines.length) : 0,
    codeFences: { count: Math.floor(fenceCount / 2) + (fenceCount % 2), balanced },
    answerFirst: detectAnswerFirst(text),
    acronyms: acronymGlossing(text),
    readability: computeReadability(text, language),
    languageFidelity: { expected: language, detected, ok: detected === language },
  };
}

export interface MetricsDelta {
  readabilityScore: number;
  sentenceWordsMean: number;
  paragraphWordsMean: number;
  headingCount: number;
  listItemShare: number;
  answerFirstRate: number;
  acronymGlossRate: number;
  words: number;
}

/**
 * Mean candidate-minus-control delta. Callers must group by language first: readability
 * scales are not comparable across languages (INFLESZ validation study).
 */
export function meanMetricsDelta(pairs: Array<{ candidate: PresentationMetrics; control: PresentationMetrics }>): MetricsDelta {
  const delta = (pick: (metrics: PresentationMetrics) => number): number =>
    round(mean(pairs.map((pair) => pick(pair.candidate) - pick(pair.control))), 3);
  return {
    readabilityScore: delta((metrics) => metrics.readability.score),
    sentenceWordsMean: delta((metrics) => metrics.sentenceWords.mean),
    paragraphWordsMean: delta((metrics) => metrics.paragraphWords.mean),
    headingCount: delta((metrics) => metrics.headings.count),
    listItemShare: delta((metrics) => metrics.listItemShare),
    answerFirstRate: delta((metrics) => (metrics.answerFirst ? 1 : 0)),
    acronymGlossRate: delta((metrics) => metrics.acronyms.glossRate),
    words: delta((metrics) => metrics.words),
  };
}
