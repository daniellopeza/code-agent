import type { RepoFile, ScoredRepoFile } from "../loadFiles.js";
import type { AskCodebaseResult } from "../ask.js";
import type { SubQuestion } from "../tools/decomposeQueryTool.js";

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
  relevantFiles: ScoredRepoFile[];
  filesRead: FileSummary[];
  notes: string[];

  subQuestions: SubQuestion[];
  currentSubQuestionId: string | undefined;
  filesBySubQuestion: Map<string, ScoredRepoFile[]>;

  steps: string[];
  finalAnswer?: string;
  finalResult?: AskCodebaseResult;

  iteration: number;
  done: boolean;
};

export type ControllerAction =
  | { type: "load_repo" }
  | { type: "decompose_query" }
  | { type: "search_files"; query: string }
  | { type: "summarize_file"; path: string }
  | { type: "answer" };
