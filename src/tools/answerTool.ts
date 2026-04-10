import { askCodebase } from "../ask.js";
import type { AskCodebaseResult } from "../ask.js";
import type { ControllerState } from "../controller/types.js";

export async function answerTool(
  state: ControllerState,
): Promise<AskCodebaseResult> {
  const filesToUse =
    state.mode === "analyze" && state.filesRead.length > 0
      ? state.filesRead.map((item) => item.file)
      : state.relevantFiles.length > 0
        ? state.relevantFiles
        : state.repoFiles;

  console.log("answerTool()");
  const enrichedQuestion = `
    User goal: ${state.userGoal}

    Mode: ${state.mode}

    Progress notes:
    ${state.notes.map((n) => `- ${n}`).join("\n")}
    `.trim();

  return await askCodebase(filesToUse, state.userGoal, enrichedQuestion);
}
