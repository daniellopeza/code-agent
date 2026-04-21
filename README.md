# Code Agent

> An AI-powered CLI tool that analyzes codebases, answers questions, explains files, and suggests implementation plans using OpenAI.

## TL;DR

A TypeScript CLI that loads a repository, retrieves relevant code context using hybrid search (keyword + embeddings), and uses OpenAI's Responses API to answer questions, explain files, or generate implementation plans. Perfect for understanding unfamiliar codebases or planning feature changes.

## Features

- ⭐ **Analyze** — Multi-step reasoning with evidence gathering (agentic-like workflow) — _primary command_
- **Explain** — Explain a single file in plain English
- **Plan** — Suggest which files to modify for a feature request
- **Ask** — Legacy command (being deprecated, use `analyze` instead)

## Requirements

- **Node.js 20+** (required by `commander@14`)
- **OpenAI API key** (set via `OPENAI_API_KEY` environment variable)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Run the CLI

**Development mode** (uses `tsx`, no build required):

```bash
# ⭐ Primary: Analyze with multi-step reasoning (agentic workflow)
npm run cli -- analyze /path/to/repo "How does the caching work?"

# Explain a single file
npm run cli -- explain src/cli.ts

# Plan a feature change
npm run cli -- plan /path/to/repo "Add JSON export support"

# Legacy: Ask a question (deprecated, use analyze)
npm run cli -- ask /path/to/repo "Where is authentication handled?"
```

**Production mode** (compiled):

```bash
npm run build
node dist/cli.js ask /path/to/repo "Your question here"
```

## Commands

| Command                               | Description                                      | Example                                                     |
| ------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| ⭐ `analyze <repoPath> <question...>` | Multi-step analysis with reasoning (recommended) | `npm run cli -- analyze ./my-repo "How does caching work?"` |
| `explain <filePath>`                  | Explain a single file                            | `npm run cli -- explain src/cli.ts`                         |
| `plan <repoPath> <request...>`        | Suggest files to change for a feature            | `npm run cli -- plan ./my-repo "Add user settings"`         |
| `ask <repoPath> <question...>`        | Legacy (deprecated, use `analyze`)               | `npm run cli -- ask ./my-repo "Where is auth handled?"`     |

## How It Works

### Architecture

```
src/cli.ts           → Commander-based CLI entry point
src/controller/      → Multi-step reasoning loop
  runController.ts   → Main controller orchestrating tools
  decideNextStep.ts  → Decides next action based on state
  types.ts           → Type definitions
src/tools/           → Reusable tools
  loadRepoTool.ts    → Loads repository files
  searchFilesTool.ts → Searches files by query
  readFileTool.ts    → Reads and summarizes files
  answerTool.ts      → Generates final answer
  decomposeQueryTool.ts → Breaks down user question
src/                 → Core utilities
  loadFiles.ts       → Recursive file loading
  chunkFiles.ts      → Text chunking with overlap
  embeddings.ts      → Embedding generation
```

### Retrieval Pipeline

1. **Load repo** — Recursively scan directory for code files
2. **Decompose query** — Break user question into sub-questions
3. **Search files** — Find relevant files using keyword matching
4. **Read files** — Load and summarize file contents
5. **Hybrid ranking** — Score chunks using:
   - Keyword matching
   - Embeddings + cosine similarity
6. **Generate answer** — Send context to OpenAI `gpt-5.4-mini`

### Controller Loop

The `analyze` command uses a controller loop that iteratively:

- Decides next action (load, search, read, answer)
- Executes the action
- Updates state
- Repeats until done (max 20 iterations)

## Project Scripts

| Script          | Description                            |
| --------------- | -------------------------------------- |
| `npm run cli`   | Run CLI in development mode with `tsx` |
| `npm run build` | Compile TypeScript to `dist/`          |
| `npm run watch` | Watch mode TypeScript compilation      |

## Dependencies

**Runtime:**

- `openai` — OpenAI SDK
- `commander` — CLI framework
- `dotenv` — Environment variable loading
- `chalk` — Terminal styling

**Development:**

- `typescript`
- `tsx` — TypeScript executor
- `@types/node`

## License

ISC
