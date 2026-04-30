import type { ControllerAction, ControllerState } from "./types.js";

export function decideNextStep(state: ControllerState): ControllerAction {
  if (state.repoFiles.length === 0) {
    return { type: "load_repo" };
  }

  // In ask mode, decompose complex questions first
  if (state.mode === "ask" && state.subQuestions.length === 0) {
    return { type: "decompose_query" };
  }

  // If we have sub-questions, search for each one
  if (state.subQuestions.length > 0) {
    const unansweredQuestion = state.subQuestions.find((sq) => !sq.answered);
    if (unansweredQuestion) {
      state.currentSubQuestionId = unansweredQuestion.id;
      console.log(`Searching for sub-question: ${unansweredQuestion.question}`);
      return { type: "search_files", query: unansweredQuestion.question };
    }
  }

  // Default: search using the full user goal if no sub-questions
  if (state.relevantFiles.length === 0) {
    console.log(" SEARCH FILES for MAIN GOAL: ");
    const query =
      state.subQuestions.length === 0 ? state.userGoal : state.userGoal;
    return { type: "search_files", query };
  }

  // For ask mode, summarize top relevant files before answering
  if (state.mode === "ask") {
    const maxFilesToSummarize = 3;
    const sortedFiles = [...state.relevantFiles].sort(
      (a, b) => b.score - a.score,
    );

    let index = state.filesRead.length;

    if (index < maxFilesToSummarize && index < sortedFiles.length) {
      const nextFile = sortedFiles[index];
      if (nextFile) {
        return { type: "summarize_file", path: nextFile.file.path };
      }
    }
  }

  // All evidence gathered, time to synthesize
  return { type: "answer" };
}
