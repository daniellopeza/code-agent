// src/tools/queryComplexity.ts

export type QueryComplexityTier = "simple" | "medium" | "complex";

export type QueryComplexityResult = {
  complexity: QueryComplexityTier;
  confidence: number;
  score: number;
  reasoning: {
    wordCount: string;
    connectors: string;
    clauseCount: string;
    technicalTerms: string;
    entityDiversity: string;
  };
};

const CONNECTORS = /\b(and|then|also|after that|next|before|while|plus)\b/gi;

const INTERROGATIVES =
  /\b(what|why|how|where|when|who|which|can|could|should|does|do|is|are)\b/gi;

const TECHNICAL_TERMS =
  /\b(api|database|db|cache|auth|authentication|authorization|oauth|jwt|token|server|client|frontend|backend|react|typescript|javascript|node|controller|agent|rag|embedding|vector|kql|azure|terraform|kubernetes|aks|retry|dag|orchestrator|pipeline|schema|class|function|interface|type|async|await)\b/gi;

function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0;
}

function getEntityDiversity(query: string): number {
  let types = 0;

  if (/[A-Z][a-zA-Z0-9]+/.test(query)) types += 1; // named/capitalized entities
  if (/\b[A-Za-z0-9_-]+\.(ts|tsx|js|jsx|json|md|css|html)\b/.test(query))
    types += 1; // files
  if (/\b[A-Za-z0-9_-]+\(.*?\)/.test(query)) types += 1; // function calls
  if (/\b[A-Za-z0-9_-]+::?[A-Za-z0-9_-]+\b/.test(query)) types += 1; // scoped refs
  if (/\b(src|tools|controllers|components|pages|app|lib)\/[^\s]+/.test(query))
    types += 1; // paths

  return types;
}

export function getQueryComplexity(query: string): QueryComplexityResult {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const connectorCount = countMatches(query, CONNECTORS);
  const interrogativeCount = countMatches(query, INTERROGATIVES);
  const technicalTermCount = countMatches(query, TECHNICAL_TERMS);
  const entityDiversity = getEntityDiversity(query);

  const wordScore = wordCount >= 25 ? 1 : wordCount >= 12 ? 0.5 : 0;
  const connectorScore =
    connectorCount >= 2 ? 1 : connectorCount === 1 ? 0.5 : 0;
  const clauseScore =
    interrogativeCount >= 2 ? 1 : interrogativeCount === 1 ? 0.4 : 0;
  const entityScore = entityDiversity >= 3 ? 1 : entityDiversity >= 1 ? 0.5 : 0;

  let score =
    wordScore * 0.3 +
    connectorScore * 0.25 +
    clauseScore * 0.25 +
    entityScore * 0.2;

  if (technicalTermCount >= 3) {
    score += 0.1;
  }

  score = Math.min(score, 1);

  const tier: QueryComplexityTier =
    score >= 0.7 ? "complex" : score >= 0.35 ? "medium" : "simple";

  return {
    complexity: tier,
    confidence: Number(score.toFixed(2)),
    score: Number(score.toFixed(2)),
    reasoning: {
      wordCount: `${wordCount} words → ${wordScore}`,
      connectors: `${connectorCount} connectors → ${connectorScore}`,
      clauseCount: `${interrogativeCount} interrogative clauses → ${clauseScore}`,
      technicalTerms: `${technicalTermCount} technical terms`,
      entityDiversity: `${entityDiversity} entity types → ${entityScore}`,
    },
  };
}

export function isComplexQuery(query: string): boolean {
  const result = getQueryComplexity(query);
  return result.complexity === "complex" || result.complexity === "medium";
}
