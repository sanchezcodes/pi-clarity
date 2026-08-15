import assert from "node:assert/strict";
import test from "node:test";
import {
  acronymGlossing,
  computePresentationMetrics,
  computeReadability,
  countSyllablesEn,
  countSyllablesEs,
  detectAnswerFirst,
  detectLanguage,
  meanMetricsDelta,
  median,
  percentChange,
  splitCodeAndProse,
  stripForReadability,
} from "./metrics.js";

test("syllable heuristics count English and Spanish words", () => {
  assert.equal(countSyllablesEn("cat"), 1);
  assert.equal(countSyllablesEn("stopped"), 1);
  assert.equal(countSyllablesEn("machine"), 2);
  assert.equal(countSyllablesEs("hola"), 2);
  assert.equal(countSyllablesEs("caos"), 2, "adjacent strong vowels are a hiatus");
  assert.equal(countSyllablesEs("agua"), 2, "diphthong stays one syllable");
  assert.equal(countSyllablesEs("día"), 2, "accented weak vowel breaks the diphthong");
});

test("readability uses a different scale per language and never shares thresholds", () => {
  const english = computeReadability("The cat sat on the mat. The dog ran fast.", "en");
  assert.equal(english.scale, "flesch-reading-ease-en");
  assert.ok(english.score > 80, `expected an easy score, got ${english.score}`);
  assert.notEqual(english.gradeLevel, null);

  const spanish = computeReadability("El gato está en la casa. El perro corre rápido.", "es");
  assert.equal(spanish.scale, "inflesz-es");
  assert.equal(spanish.gradeLevel, null);
  assert.ok(["normal", "bastante_facil", "muy_facil"].includes(spanish.band), `unexpected band ${spanish.band}`);
});

test("readability strips code, URLs, identifiers, and proper-name-shaped tokens", () => {
  const stripped = stripForReadability([
    "Run the check now.",
    "",
    "```bash",
    "npm run check --verbose",
    "```",
    "",
    "See https://example.com/docs and src/judge.ts for `parsePiOutput` in RunResult.",
  ].join("\n"));
  assert.ok(stripped.includes("Run the check now"));
  assert.ok(!stripped.includes("npm run check"));
  assert.ok(!stripped.includes("example.com"));
  assert.ok(!stripped.includes("judge.ts"));
  assert.ok(!stripped.includes("parsePiOutput"));
  assert.ok(!stripped.includes("RunResult"));
});

test("splitCodeAndProse reports unbalanced fences", () => {
  const balanced = splitCodeAndProse("text\n```\ncode\n```\nmore");
  assert.equal(balanced.balanced, true);
  assert.equal(balanced.codeBlocks.length, 1);
  assert.ok(!balanced.prose.includes("code"));
  assert.equal(splitCodeAndProse("text\n```\ncode").balanced, false);
});

test("answer-first detection rejects preambles in both languages", () => {
  assert.equal(detectAnswerFirst("Comets are icier than asteroids."), true);
  assert.equal(detectAnswerFirst("Great question! Comets are icier than asteroids."), false);
  assert.equal(detectAnswerFirst("Claro, los cometas tienen más hielo."), false);
  assert.equal(detectAnswerFirst("Los cometas tienen más hielo que los asteroides."), true);
  assert.equal(detectAnswerFirst("## Answer\n\nComets are icier."), true, "a heading is not a preamble");
});

test("acronym glossing counts first-use definitions in either direction", () => {
  const glossed = acronymGlossing("RAG (retrieval-augmented generation) improves grounding.");
  assert.equal(glossed.total, 1);
  assert.equal(glossed.glossRate, 1);
  const inverted = acronymGlossing("Retrieval-augmented generation (RAG) improves grounding.");
  assert.equal(inverted.glossed, 1);
  const bare = acronymGlossing("RAG improves grounding for LLM answers.");
  assert.equal(bare.total, 2);
  assert.equal(bare.glossRate, 0);
});

test("language detection backs the Spanish-answer fidelity gate", () => {
  assert.equal(detectLanguage("Los cometas se distinguen por el hielo que contienen."), "es");
  assert.equal(detectLanguage("The comets are distinguished by the ice that they contain."), "en");
  assert.equal(detectLanguage("```\ncode only\n```"), "unknown");
});

test("presentation metrics capture structure without judging it", () => {
  const metrics = computePresentationMetrics([
    "Use a queue.",
    "",
    "## Why",
    "",
    "- It decouples producers.",
    "- It absorbs bursts.",
    "",
    "```ts",
    "const queue = [];",
    "```",
  ].join("\n"), "en");
  assert.equal(metrics.headings.count, 1);
  assert.equal(metrics.headings.maxDepth, 2);
  assert.equal(metrics.codeFences.count, 1);
  assert.equal(metrics.codeFences.balanced, true);
  assert.ok(metrics.listItemShare > 0.3 && metrics.listItemShare < 0.7);
  assert.equal(metrics.answerFirst, true);
  assert.equal(metrics.languageFidelity.ok, true);
});

test("Spanish output for an English case fails language fidelity", () => {
  const metrics = computePresentationMetrics("Los cometas tienen más hielo que los asteroides.", "en");
  assert.equal(metrics.languageFidelity.expected, "en");
  assert.equal(metrics.languageFidelity.detected, "es");
  assert.equal(metrics.languageFidelity.ok, false);
});

test("meanMetricsDelta averages candidate minus control", () => {
  const control = computePresentationMetrics("A single sentence answer.", "en");
  const candidate = computePresentationMetrics("A single sentence answer.\n\n- one\n- two", "en");
  const delta = meanMetricsDelta([{ candidate, control }]);
  assert.ok(delta.listItemShare > 0);
  assert.ok(delta.words > 0);
});

test("median and percentChange support the operational guardrails", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(percentChange(110, 100), 10);
  assert.equal(percentChange(5, 0), null);
});
