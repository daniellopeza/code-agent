import { askCodebase } from "../ask.js";
import type { AskCodebaseResult } from "../ask.js";
import type { ControllerState } from "../controller/types.js";

export async function answerTool(
  state: ControllerState,
): Promise<AskCodebaseResult> {
  const filesToUse =
    state.mode === "ask" && state.filesRead.length > 0
      ? state.filesRead.map((item) => item.file)
      : state.relevantFiles.length > 0
        ? state.relevantFiles.map((item) => item.file)
        : state.repoFiles;

  // Build evidence section for ask mode with file summaries
  const evidenceSection =
    state.mode === "ask" && state.filesRead.length > 0
      ? `
## Gathered Evidence

${state.filesRead
  .map(
    (fs, i) =>
      `### File ${i + 1}: ${fs.file.path}
${fs.summary}`,
  )
  .join("\n\n")}
`.trim()
      : "";

  // Build sub-question context if available
  const subQuestionSection =
    state.subQuestions.length > 0
      ? `
## Analysis Breakdown

Original question decomposed into:
${state.subQuestions.map((sq) => `- [${sq.answered ? "✓" : "✗"}] ${sq.question}`).join("\n")}
`.trim()
      : "";

  const enrichedQuestion = `
${subQuestionSection}

${evidenceSection}

User Goal: ${state.userGoal}

Please synthesize the gathered evidence to answer the original question comprehensively.
  `.trim();

  return await askCodebase(filesToUse, state.userGoal, enrichedQuestion);
}
