import path from "path";
import type { RepoFile, ScoredRepoFile } from "../loadFiles.js";
import { embedFiles, embedQuery, cosineSimilarity } from "../embeddings.js";

type ScoredFile = {
  file: RepoFile;
  score: number;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "your",
  "what",
  "when",
  "where",
  "which",
  "how",
  "can",
  "could",
  "should",
  "would",
  "about",
  "take",
  "uses",
  "using",
  "used",
  "learn",
  "learnings",
  "create",
  "build",
  "make",
  "app",
  "new",
]);

function tokenize(text: unknown): string[] {
  const safeText = typeof text === "string" ? text : String(text ?? "");

  return safeText
    .toLowerCase()
    .replace(/[^a-z0-9_./-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueTokens(text: unknown): string[] {
  return [...new Set(tokenize(text))];
}

function normalizeQueryTokens(question: string): string[] {
  return uniqueTokens(question).filter(
    (token) => token.length >= 2 && !STOPWORDS.has(token),
  );
}

function getFileName(filePath: string): string {
  return path.basename(filePath).toLowerCase();
}

function getPathSegments(filePath: string): string[] {
  return filePath.toLowerCase().split(/[\\/]/).filter(Boolean);
}

function getContentPreview(content: string): string {
  return content.slice(0, 12000).toLowerCase();
}

function getInterestingPhrases(question: string): string[] {
  const lowered = question.toLowerCase();

  const phrases: string[] = [];

  // Add 2-word and 3-word windows from the question.
  const tokens = normalizeQueryTokens(lowered);

  for (let i = 0; i < tokens.length - 1; i++) {
    const twoWord = `${tokens[i]} ${tokens[i + 1]}`;
    phrases.push(twoWord);

    if (i < tokens.length - 2) {
      const threeWord = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      phrases.push(threeWord);
    }
  }

  return [...new Set(phrases)].filter((phrase) => phrase.length >= 6);
}

function isProbablyLowValueFile(filePath: string): boolean {
  const lowered = filePath.toLowerCase();

  return (
    lowered.includes(".test.") ||
    lowered.includes(".spec.") ||
    lowered.includes("__tests__") ||
    lowered.endsWith(".md") ||
    lowered.includes("/dist/") ||
    lowered.includes("/coverage/") ||
    lowered.includes("/node_modules/")
  );
}

function scoreIntentHeuristics(question: string, file: RepoFile): number {
  const loweredQuestion = question.toLowerCase();
  const filePath = String(file.path ?? "").toLowerCase();
  const content = getContentPreview(String(file.content ?? ""));

  let score = 0;

  // Auth-related intent
  if (loweredQuestion.includes("auth") || loweredQuestion.includes("login")) {
    if (
      filePath.includes("auth") ||
      content.includes("login") ||
      content.includes("token") ||
      content.includes("jwt") ||
      content.includes("oauth") ||
      content.includes("session")
    ) {
      score += 18;
    }
  }

  // React / UI / frontend intent
  if (
    loweredQuestion.includes("react") ||
    loweredQuestion.includes("component") ||
    loweredQuestion.includes("ui") ||
    loweredQuestion.includes("frontend")
  ) {
    if (
      filePath.endsWith(".tsx") ||
      filePath.includes("component") ||
      content.includes("usestate") ||
      content.includes("useeffect") ||
      content.includes("jsx") ||
      content.includes("return (")
    ) {
      score += 14;
    }
  }

  // AI / chatbot intent
  if (
    loweredQuestion.includes("ai") ||
    loweredQuestion.includes("chatbot") ||
    loweredQuestion.includes("assistant") ||
    loweredQuestion.includes("prompt")
  ) {
    if (
      filePath.includes("chat") ||
      filePath.includes("prompt") ||
      filePath.includes("agent") ||
      content.includes("openai") ||
      content.includes("messages") ||
      content.includes("prompt") ||
      content.includes("assistant") ||
      content.includes("completion")
    ) {
      score += 16;
    }
  }

  // API / backend intent
  if (
    loweredQuestion.includes("api") ||
    loweredQuestion.includes("backend") ||
    loweredQuestion.includes("server") ||
    loweredQuestion.includes("endpoint")
  ) {
    if (
      filePath.includes("api") ||
      filePath.includes("server") ||
      filePath.includes("route") ||
      filePath.includes("controller") ||
      content.includes("fetch(") ||
      content.includes("axios") ||
      content.includes("express") ||
      content.includes("router")
    ) {
      score += 14;
    }
  }

  return score;
}

export function scoreFile(question: string, file: RepoFile): number {
  const qTokens = normalizeQueryTokens(question);
  const filePath = String(file.path ?? "").toLowerCase();
  const fileName = getFileName(filePath);
  const pathSegments = getPathSegments(filePath);
  const contentStart = getContentPreview(String(file.content ?? ""));
  const phrases = getInterestingPhrases(question);

  let score = 0;
  let matchedTokenCount = 0;

  for (const token of qTokens) {
    let matchedThisToken = false;

    // Best signal: exact file name clues
    if (fileName.includes(token)) {
      score += 18;
      matchedThisToken = true;
    }

    // Strong signal: path segment match
    if (pathSegments.some((segment) => segment.includes(token))) {
      score += 10;
      matchedThisToken = true;
    }

    // Useful signal: content match
    if (contentStart.includes(token)) {
      score += 4;
      matchedThisToken = true;
    }

    if (matchedThisToken) {
      matchedTokenCount += 1;
    }
  }

  // Reward files that match more of the user's intent, not just one lucky token.
  score += matchedTokenCount * 3;

  // Bonus when a large fraction of meaningful tokens match.
  if (qTokens.length > 0) {
    const coverage = matchedTokenCount / qTokens.length;

    if (coverage >= 0.6) score += 12;
    else if (coverage >= 0.4) score += 7;
    else if (coverage >= 0.25) score += 3;
  }

  // Phrase matching can be very useful for multi-word intent.
  for (const phrase of phrases) {
    if (filePath.includes(phrase)) {
      score += 12;
    } else if (contentStart.includes(phrase)) {
      score += 6;
    }
  }

  score += scoreIntentHeuristics(question, file);

  // Light penalty for lower-value files when user seems implementation-focused.
  if (isProbablyLowValueFile(filePath)) {
    score -= 8;
  }

  return score;
}

export function pickTopFiles(
  question: string,
  files: RepoFile[],
  limit = 10,
): ScoredRepoFile[] {
  const scored: ScoredRepoFile[] = files.map((file) => ({
    file,
    score: scoreFile(question, file),
  }));

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function hybridPickTopFiles(
  question: string,
  files: RepoFile[],
  limit = 10,
  lexicalCandidates = 30,
): Promise<ScoredRepoFile[]> {
  // Phase 1: Lexical narrowing
  console.log("Starting lexical ranking...");
  const lexicalTop = pickTopFiles(question, files, lexicalCandidates);
  if (lexicalTop.length === 0) return [];

  // Phase 2: Semantic reranking
  console.log("Embedding candidate files...");
  const candidateFiles = lexicalTop.map((s) => s.file);
  console.log("Embedding files...");
  const embeddedFiles = await embedFiles(candidateFiles);
  console.log("Embedding query...");
  const queryEmbedding = await embedQuery(question);

  // Compute semantic scores
  console.log("Computing semantic similarity...");
  const semanticScores: number[] = embeddedFiles.map((file) =>
    cosineSimilarity(queryEmbedding, file.embedding),
  );

  // Normalize scores
  const lexicalScores = lexicalTop.map((s) => s.score);
  const maxLexical = Math.max(...lexicalScores);
  const normalizedLexical = lexicalScores.map((s) =>
    maxLexical > 0 ? s / maxLexical : 0,
  );
  const normalizedSemantic = semanticScores.map((s) => (s + 1) / 2); // [-1,1] to [0,1]

  // Combine scores: 70% lexical, 30% semantic
  const combinedScores: number[] = normalizedLexical.map(
    (lex, i) => 0.7 * lex + 0.3 * (normalizedSemantic[i] ?? 0),
  );

  // Create final scored results
  const finalScored: ScoredRepoFile[] = lexicalTop.map((item, i) => ({
    file: item.file,
    score: combinedScores[i] ?? 0,
  }));

  // Sort by combined score and take top limit
  console.log("Sorting final results...");
  return finalScored.sort((a, b) => b.score - a.score).slice(0, limit);
}
