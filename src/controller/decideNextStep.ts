import type { ControllerAction, ControllerState } from "./types.js";

// Decide next step to find relevant files.
export function decideNextStep(state: ControllerState): ControllerAction {
  if (state.repoFiles.length === 0) {
    console.log("Looking for repo files.. ");
    return { type: "load_repo" };
  }

  if (state.relevantFiles.length === 0) {
    console.log("Looking for relevant files.. ");
    return { type: "search_files", query: state.userGoal };
  }

  // if (state.relevantFiles.length > 5) {
  //   console.log(
  //     "decideNextStep() - found 5 or more relevant files (narrow down)",
  //   );
  //   const narrowed = extractImportantKeyword(state.userGoal);
  //   console.log("narrowed: ", narrowed);
  //   return { type: "search_files", query: narrowed };
  //   // return { type: "search_files", query: state.userGoal };
  // }

  console.log("Files present. Answering.. ");
  return { type: "answer" };
}

function extractImportantKeyword(goal: string): string {
  const words = goal.split(/\s+/).filter((w) => w.length > 4);
  return words[0] ?? goal;
}
