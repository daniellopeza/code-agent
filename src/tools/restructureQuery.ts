// src/tools/restructureQuery.ts

import type {
  QueryComplexityResult,
  QueryComplexityTier,
} from "./queryComplexity.js";

export type QueryIntent =
  | "find_location"
  | "explain_behavior"
  | "trace_flow"
  | "debug_issue"
  | "find_usage"
  | "compare"
  | "summarize_concept"
  | "unknown";

export type QueryRestructureState = {
  originalQuery: string;
  complexity: QueryComplexityTier;
  complexityScore: number;
  intent: QueryIntent;
  shouldDecompose: boolean;
  shouldRestructure: boolean;
  constraints: {
    preserveOriginalTerms: boolean;
    avoidLexicalInflation: boolean;
    maxQueries: number;
    maxWordsPerQuery: number;
  };
  guidance: string;
};

export function restructureQuery(
  query: string,
  complexity: QueryComplexityResult,
): QueryRestructureState {
  const normalized = query.trim();
  const intent = inferIntent(normalized);

  return {
    originalQuery: normalized,
    complexity: complexity.complexity,
    complexityScore: complexity.score,
    intent,
    shouldDecompose: complexity.complexity === "complex",
    shouldRestructure:
      complexity.complexity === "simple" || complexity.complexity === "medium",
    constraints: {
      preserveOriginalTerms: true,
      avoidLexicalInflation: true,
      maxQueries: complexity.complexity === "complex" ? 4 : 1,
      maxWordsPerQuery: complexity.complexity === "simple" ? 12 : 18,
    },
    guidance: buildGuidance(complexity.complexity, intent),
  };
}

function inferIntent(query: string): QueryIntent {
  const lower = query.toLowerCase();

  if (/\bwhere\b|\blocation\b|\bfind\b/.test(lower)) {
    return "find_location";
  }

  if (/\bhow\b|\bflow\b|\btrace\b|\blifecycle\b/.test(lower)) {
    return "trace_flow";
  }

  if (/\bwhy\b|\berror\b|\bfailing\b|\bbug\b|\bbroken\b/.test(lower)) {
    return "debug_issue";
  }

  if (/\bused\b|\busage\b|\breference\b|\bcalled\b|\bcallers\b/.test(lower)) {
    return "find_usage";
  }

  if (/\bcompare\b|\bdifference\b|\bvs\b|\bversus\b/.test(lower)) {
    return "compare";
  }

  if (/\bwhat does\b|\bexplain\b|\bpurpose\b/.test(lower)) {
    return "explain_behavior";
  }

  return "unknown";
}

function buildGuidance(tier: QueryComplexityTier, intent: QueryIntent): string {
  if (tier === "complex") {
    return [
      "Decompose the original query into 2-4 independent code-searchable sub-questions.",
      "Each sub-question should preserve important original terms.",
      "Do not add broad unrelated technical terms.",
    ].join(" ");
  }

  if (tier === "simple") {
    return [
      "Rewrite the query into one concise code-search query.",
      "Add only minimal missing intent context.",
      "Do not fragment into sub-questions.",
    ].join(" ");
  }

  return [
    "Clarify the query intent into one focused code-search query.",
    "Preserve original terms.",
    "Avoid adding unnecessary words that could distort lexical ranking.",
    `Detected intent: ${intent}.`,
  ].join(" ");
}
