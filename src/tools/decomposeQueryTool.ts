// src/tools/decomposeQueryTool.ts

import OpenAI from "openai";
import type { QueryRestructureState } from "./restructureQuery.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type SubQuestion = {
  id: string;
  question: string;
  answered: boolean;
};

export type QueryPlan =
  | {
      type: "single";
      query: string;
      reasoning?: string;
    }
  | {
      type: "decomposed";
      subQuestions: SubQuestion[];
      reasoning?: string;
    };

export async function shapeQuery(
  state: QueryRestructureState,
): Promise<QueryPlan> {
  if (state.shouldDecompose) {
    const subQuestions = await decomposeQueryFromState(state);
    return {
      type: "decomposed",
      subQuestions,
      reasoning: "Complex query decomposed into sub-questions.",
    };
  }

  const query = await restructureSingleQueryFromState(state);

  return {
    type: "single",
    query,
    reasoning: "Simple or medium query restructured into one search query.",
  };
}

async function restructureSingleQueryFromState(
  state: QueryRestructureState,
): Promise<string> {
  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content: [
          "You rewrite user questions into concise code-search queries.",
          "Return ONLY JSON with this shape:",
          `{ "query": string }`,
          "Rules:",
          "- Keep exactly one query.",
          "- Preserve important original terms.",
          "- Do not add broad unrelated technical terms.",
          "- Do not inflate lexical ranking with unnecessary synonyms.",
          "- For simple queries, add only minimal missing intent.",
          "- For medium queries, clarify intent without decomposing.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(state, null, 2),
      },
    ],
    max_output_tokens: 200,
  });

  const text = response.output_text?.trim();
  if (!text) {
    return state.originalQuery;
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return state.originalQuery;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { query?: string };
    return parsed.query?.trim() || state.originalQuery;
  } catch {
    return state.originalQuery;
  }
}

async function decomposeQueryFromState(
  state: QueryRestructureState,
): Promise<SubQuestion[]> {
  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content: [
          "Break down the user's complex codebase question into 2-4 simpler, independent sub-questions.",
          "Each sub-question should be answerable by searching and analyzing code files.",
          "Preserve important original terms.",
          "Avoid adding broad unrelated technical terms.",
          "Return ONLY a JSON array of objects with a 'question' field.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(state, null, 2),
      },
    ],
    max_output_tokens: 300,
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("No decomposition returned");
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [{ id: "0", question: state.originalQuery, answered: false }];
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{ question: string }>;

  return parsed.map((item, index) => ({
    id: String(index),
    question: item.question,
    answered: false,
  }));
}
