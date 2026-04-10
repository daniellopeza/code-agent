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

  // For analyze mode, summarize top relevant files before answering.
  if (state.mode === "analyze") {
    const maxFilesToSummarize = 3;
    if (state.filesRead.length < maxFilesToSummarize) {
      const nextFile = state.relevantFiles.find(
        (file) => !state.filesRead.some((item) => item.file.path === file.path),
      );
      if (nextFile) {
        console.log(`Summarizing next file: ${nextFile.path}`);
        return { type: "summarize_file", path: nextFile.path };
      }
    }
  }

  console.log("Files present. Answering.. ");
  return { type: "answer" };
}
