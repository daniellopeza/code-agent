import type {
  ControllerInput,
  ControllerState,
  ControllerAction,
} from "./types.js";
import { decideNextStep } from "./decideNextStep.js";
import { loadRepoTool } from "../tools/loadRepoTool.js";
import { searchFilesTool } from "../tools/searchFilesTool.js";
import { summarizeFileTool } from "../tools/readFileTool.js";
import { answerTool } from "../tools/answerTool.js";
import { shapeQuery } from "../tools/decomposeQueryTool.js";
import { getQueryComplexity } from "../tools/queryComplexity.js";
import { restructureQuery } from "../tools/restructureQuery.js";

export async function runController(input: ControllerInput) {
  const state: ControllerState = {
    repoPath: input.repoPath,
    userGoal: input.userGoal,
    mode: input.mode,

    repoFiles: [],
    relevantFiles: [],
    filesRead: [],
    notes: [],
    subQuestions: [],
    currentSubQuestionId: undefined,
    filesBySubQuestion: new Map(),
    steps: [],
    iteration: 0,
    done: false,
  };

  const maxIterations = 20;
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`Starting controller run: ${runId}`);

  while (!state.done && state.iteration < maxIterations) {
    console.log("starting iteration: ", state.iteration);
    state.iteration += 1;

    const action = decideNextStep(state);
    state.steps.push(describeAction(action));

    if (input.verbose) {
      console.log(`Step ${state.iteration}: ${describeAction(action)}`);
    }

    switch (action.type) {
      case "load_repo": {
        console.log("loading repo from path: ", state.repoPath);
        state.repoFiles = loadRepoTool(state.repoPath);
        console.log("loaded repo. Number of files: ", state.repoFiles.length);
        state.notes.push(`Loaded ${state.repoFiles.length} repo files.`);
        break;
      }

      case "decompose_query": {
        console.log("decompose_query - breaking down user goal");
        const complexity = getQueryComplexity(state.userGoal);
        const restructureState = restructureQuery(state.userGoal, complexity);
        const queryPlan = await shapeQuery(restructureState);

        state.subQuestions =
          queryPlan.type === "decomposed" ? queryPlan.subQuestions : [];

        console.log("Decomposed query plan:", queryPlan);

        if (state.subQuestions.length > 0) {
          console.log(
            `Decomposed into ${state.subQuestions.length} sub-questions:`,
          );
          state.subQuestions.forEach((sq, index) => {
            console.log(`${index + 1}. ${sq.question}`);
          });
        } else {
          console.log(
            "No sub-questions generated. Will treat as single query.",
          );
          // TODO: overrite original?
          state.userGoal =
            queryPlan.type === "single" ? queryPlan.query : state.userGoal;
        }

        break;
      }

      // TODO: add a multi-step controller loop that can iteratively search, read, and synthesize evidence before answering

      // find relevant files in the repo
      case "search_files": {
        console.log("search-files - query:", action.query);

        const matches = await searchFilesTool(state.repoFiles, action.query);

        if (matches.length === 0) {
          console.log("No matching files found.");
          break;
        }

        if (state.subQuestions.length > 0) {
          // Store files for current sub-question
          if (state.currentSubQuestionId) {
            state.filesBySubQuestion.set(state.currentSubQuestionId, matches);
          }

          const allMatches = Array.from(
            state.filesBySubQuestion.values(),
          ).flat();

          // Remove duplicates, keeping the highest score for each file
          const bestScoreByPath = new Map<string, number>();
          const bestMatchByPath = new Map<string, any>();

          for (const match of allMatches) {
            const currentScore =
              bestScoreByPath.get(match.file.path) ?? -Infinity;
            if (match.score > currentScore) {
              bestScoreByPath.set(match.file.path, match.score);
              bestMatchByPath.set(match.file.path, match);
            }
          }

          // Sort by score (highest first)
          state.relevantFiles = Array.from(bestMatchByPath.values());

          console.log(
            `Found ${matches.length} relevant files for this sub-question:`,
          );
          matches.forEach((m, index) => {
            console.log(`${index + 1}. [score=${m.score}] ${m.file.path}`);
          });

          state.notes.push(
            `[Sub-Q ${state.currentSubQuestionId}] Found ${matches.length} files for: "${action.query}".`,
          );

          // Mark current sub-question as answered
          if (state.currentSubQuestionId) {
            const subQ = state.subQuestions.find(
              (sq) => sq.id === state.currentSubQuestionId,
            );
            if (subQ) {
              subQ.answered = true;
            }
          }
        } else {
          state.relevantFiles = matches;
        }

        break;
      }

      // read a specific file and extract a summary
      case "summarize_file": {
        console.log("summarize_file:", action.path);

        const match = state.relevantFiles.find(
          (m) => m.file.path === action.path,
        );
        const file =
          match?.file ?? state.repoFiles.find((f) => f.path === action.path);

        if (!file) {
          console.log("File not found in repoFiles.");
          break;
        }

        const summary = await summarizeFileTool(file);
        const note = `Summary for ${file.path}: ${summary.replace(/\n+/g, " ").slice(0, 400)}`;

        state.notes.push(note);
        state.filesRead.push({ file, summary });

        console.log(`Summarized file: ${file.path}`);
        break;
      }

      case "answer": {
        // console.log("answer state: ", state);
        const result = await answerTool(state);
        state.finalResult = result;
        state.finalAnswer = result.answer;
        state.notes.push("Generated final answer.");
        state.done = true;
        break;
      }
    }
  }

  console.log("While done. ");

  if (!state.finalAnswer) {
    state.finalAnswer = "I could not generate a final answer.";
  }

  return state;
}

function describeAction(action: ControllerAction): string {
  switch (action.type) {
    case "load_repo":
      return "Load repository";
    case "decompose_query":
      return "Decompose question into sub-questions";
    case "search_files":
      return `Search files for: ${action.query}`;
    case "summarize_file":
      return `Summarize file: ${action.path}`;
    case "answer":
      return "Generate final answer";
  }
}
