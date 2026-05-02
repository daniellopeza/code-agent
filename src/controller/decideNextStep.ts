import type { ControllerAction, ControllerState } from "./types.js";
import {
  getQueryComplexity,
  isComplexQuery,
} from "../tools/queryComplexity.js";

export function decideNextStep(state: ControllerState): ControllerAction {
  if (state.repoFiles.length === 0) {
    return { type: "load_repo" };
  }

  // In ask mode, only decompose medium/complex questions after loading files.
  // can we do async or simultaneous??
  if (state.mode === "ask" && state.iteration === 1) {
    const complexity = getQueryComplexity(state.userGoal);

    console.log("Query complexity:", complexity);
    return { type: "decompose_query" };
  }

  if (state.subQuestions.length > 0) {
    const unansweredQuestion = state.subQuestions.find((sq) => !sq.answered);
    if (unansweredQuestion) {
      state.currentSubQuestionId = unansweredQuestion.id;
      console.log(`Searching for sub-question: ${unansweredQuestion.question}`);
      return { type: "search_files", query: unansweredQuestion.question };
    }
  }

  if (state.relevantFiles.length === 0) {
    console.log(" SEARCH FILES for MAIN GOAL: ");
    return { type: "search_files", query: state.userGoal };
  }

  if (state.mode === "ask") {
    const maxFilesToSummarize = 3;
    const sortedFiles = [...state.relevantFiles].sort(
      (a, b) => b.score - a.score,
    );

    const index = state.filesRead.length;

    if (index < maxFilesToSummarize && index < sortedFiles.length) {
      const nextFile = sortedFiles[index];
      if (nextFile) {
        return { type: "summarize_file", path: nextFile.file.path };
      }
    }
  }

  return { type: "answer" };
}
