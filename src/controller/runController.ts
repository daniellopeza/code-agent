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

export async function runController(input: ControllerInput) {
  const state: ControllerState = {
    repoPath: input.repoPath,
    userGoal: input.userGoal,
    mode: input.mode,

    repoFiles: [],
    relevantFiles: [],
    filesRead: [],
    notes: [],
    steps: [],
    iteration: 0,
    done: false,
  };

  const maxIterations = 20;

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

      // TODO: add a multi-step controller loop that can iteratively search, read, and synthesize evidence before answering

      // find relevant files in the repo
      case "search_files": {
        console.log("search-files - query:", action.query);

        const matches = await searchFilesTool(state.repoFiles, action.query);

        if (matches.length === 0) {
          console.log("No matching files found.");
          break;
        }

        state.relevantFiles = matches.map((m) => m.file);

        console.log(`Found ${matches.length} relevant files:`);
        matches.forEach((m, index) => {
          console.log(`${index + 1}. [score=${m.score}] ${m.file.path}`);
        });

        state.notes.push(
          `Found ${matches.length} potentially relevant files for query "${action.query}".`,
        );

        break;
      }

      // read a specific file and extract a summary
      case "summarize_file": {
        console.log("summarize_file - path:", action.path);

        const file = state.repoFiles.find((f) => f.path === action.path);
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
        console.log("answer state: ", state);
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
    case "search_files":
      return `Search files for: ${action.query}`;
    case "summarize_file":
      return `Summarize file: ${action.path}`;
    case "answer":
      return "Generate final answer";
  }
}
