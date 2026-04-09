import type {
  ControllerInput,
  ControllerState,
  ControllerAction,
} from "./types.js";
import { decideNextStep } from "./decideNextStep.js";
import { loadRepoTool } from "../tools/loadRepoTool.js";
import { searchFilesTool } from "../tools/searchFilesTool.js";
// import { readFileTool } from "../tools/readFileTool.js";
import { answerTool } from "../tools/answerTool.js";

export async function runController(input: ControllerInput) {
  const state: ControllerState = {
    repoPath: input.repoPath,
    userGoal: input.userGoal,
    mode: input.mode,

    repoFiles: [],
    relevantFiles: [],
    notes: [],
    steps: [],
    iteration: 0,
    done: false,
  };

  const maxIterations = 5;

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

      case "answer": {
        // console.log("answer state: ", state);
        console.log("answer");
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
    case "read_file":
      return `Read file: ${action.path}`;
    case "answer":
      return "Generate final answer";
  }
}
