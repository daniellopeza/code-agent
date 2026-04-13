import type { ControllerAction, ControllerState } from "./types.js";

export function decideNextStep(state: ControllerState): ControllerAction {
  if (state.repoFiles.length === 0) {
    return { type: "load_repo" };
  }

  // In analyze mode, decompose complex questions first
  if (state.mode === "analyze" && state.subQuestions.length === 0) {
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
    const query =
      state.subQuestions.length === 0 ? state.userGoal : state.userGoal;
    return { type: "search_files", query };
  }

  // For analyze mode, summarize top relevant files before answering
  if (state.mode === "analyze") {
    const maxFilesToSummarize = 3;
    if (state.filesRead.length < maxFilesToSummarize) {
      const nextFile = state.relevantFiles.find(
        (file) => !state.filesRead.some((item) => item.file.path === file.path),
      );
      if (nextFile) {
        return { type: "summarize_file", path: nextFile.path };
      }
    }
  }

  // All evidence gathered, time to synthesize
  return { type: "answer" };
}
