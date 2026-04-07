import type { ControllerAction, ControllerState } from "./types.js";

export function decideNextStep(state: ControllerState): ControllerAction {
  if (state.repoFiles.length === 0) {
    console.log("Looking for repo files.. ");
    return { type: "load_repo" };
  }

  if (state.relevantFiles.length === 0) {
    console.log("Looking for relevant files.. ");
    return { type: "search_files", query: state.userGoal };
  }

  console.log("Files present. Answering.. ");
  return { type: "answer" };
}
