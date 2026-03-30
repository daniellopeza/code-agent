import type { ControllerAction, ControllerState } from "./types.js";

export function decideNextStep(state: ControllerState): ControllerAction {
  console.log("decideNextStep()");
  if (state.repoFiles.length === 0) {
    console.log("decideNextStep() - no files");
    return { type: "load_repo" };
  }

  if (state.relevantFiles.length === 0) {
    console.log("decideNextStep() - no relevant files");
    return { type: "search_files", query: state.userGoal };
  }

  if (state.relevantFiles.length > 5) {
    console.log("decideNextStep() - +5");
    const narrowed = extractImportantKeyword(state.userGoal);
    return { type: "search_files", query: narrowed };
  }
  console.log("decideNextStep() - a");
  return { type: "answer" };
}

function extractImportantKeyword(goal: string): string {
  const words = goal.split(/\s+/).filter((w) => w.length > 4);
  return words[0] ?? goal;
}
