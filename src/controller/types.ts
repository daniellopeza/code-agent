import type { RepoFile } from "../loadFiles.js";
import type { AskCodebaseResult } from "../ask.js";

export type AgentMode = "ask" | "analyze" | "explain" | "plan";

export type ControllerInput = {
  repoPath: string;
  userGoal: string;
  mode: AgentMode;
  verbose?: boolean;
};

export type FileSummary = {
  file: RepoFile;
  summary: string;
};

export type ControllerState = {
  repoPath: string;
  userGoal: string;
  mode: AgentMode;

  repoFiles: RepoFile[];
  relevantFiles: RepoFile[];
  filesRead: FileSummary[];
  notes: string[];

  steps: string[];
  finalAnswer?: string;
  finalResult?: AskCodebaseResult;

  iteration: number;
  done: boolean;
};

export type ControllerAction =
  | { type: "load_repo" }
  | { type: "search_files"; query: string }
  | { type: "summarize_file"; path: string }
  | { type: "answer" };
