# Code Agent

A small TypeScript CLI that lets you ask questions about a codebase, explain files, and generate a rough implementation plan using OpenAI.

## What it does

This app scans a repository, ranks relevant files, chunks their contents, and sends selected context to an OpenAI model for grounded responses.

It currently supports three CLI commands:

- `ask` — ask a question about a repository
- `explain` — explain a single file
- `plan` — suggest which files to modify for a feature request

## How it works

The main retrieval pipeline is implemented in:

- `src/cli.ts` — CLI commands and command wiring
- `src/ask.ts` — repository question answering and hybrid retrieval
- `src/chunkFiles.ts` — splits files into overlapping text chunks
- `src/index.ts` — older/simple entry point for asking a question directly

### Retrieval flow

In `src/ask.ts`, the app:

1. Scores files using keyword matching against the question
2. Keeps the top files
3. Chunks those files into ~3000-character segments
4. Ranks chunks with a hybrid approach:
   - keyword matching
   - embeddings
   - cosine similarity
5. Adds neighboring chunks for context continuity
6. Sends the final context to OpenAI for the answer

### OpenAI usage

The app uses the OpenAI Responses API with model:

- `gpt-5.4-mini`

## Requirements

From `package.json`:

- Node.js 20+ is recommended because `commander@14` requires `node >=20`
- An OpenAI API key in `OPENAI_API_KEY`

## Dependencies

Runtime dependencies:

- `openai`
- `commander`
- `dotenv`
- `chalk`

Dev dependencies:

- `typescript`
- `tsx`
- `@types/node`

## Project scripts

Defined in `package.json`:

- `npm run cli` — run the CLI directly with `tsx src/cli.ts`
- `npm run build` — compile TypeScript to `dist/`
- `npm run watch` — watch mode TypeScript compilation

### Binary name

`package.json` exposes a bin entry:

- `code-agent` → `./dist/cli.js`

So after building, it can be run as a CLI binary.

## Usage

### 1) Install dependencies

```bash
npm install
```

### 2) Add environment variables

Create a `.env` file:

```env
OPENAI_API_KEY=your_api_key_here
```

### 3) Run the CLI

use CLI direcly in Development (fast iteration)
uses:

1. tsx
2. no build
3. always latest code

#### Ask about a repo

```bash
npm run cli -- ask /path/to/repo "Where is authentication handled?"
```

#### Explain a file

```bash
npm run cli -- explain src/ask.ts
```

#### Suggest a change plan

```bash
npm run cli -- plan /path/to/repo "Add support for exporting results as JSON"
```

### 4) Build the project (Production-style CLI)

uses:

1. compiled JS
2. global command
3. real-world behavior

```bash
npm run build
```

`package.json` exposes a binary entry:

- `code-agent` → `./dist/cli.js`

After building, you can run the compiled app with:

```bash
node dist/cli.js
```

Or use the binary name directly if available (run npm link to create):

### `ask <repoPath> <question...>`

Loads a repository and answers a question using retrieved file context.

Example:

```bash
code-agent ask /path/to/repo "Where is file chunking implemented?"
```

### `explain <filePath>`

Explains a single file using OpenAI.

Example:

```bash
code-agent explain src/cli.ts
```

### `plan <repoPath> <request...>`

Suggests which files should change for a requested feature.

Example:

```bash
code-agent plan /path/to/repo "Add a new command to export answers as markdown"
```

Note:

1. tsx src/cli.ts → dev runner
2. dist/cli.js → production artifact
3. bin → exposes command
4. npm link → installs CLI globally

## File overview

### `src/cli.ts`

Main Commander-based CLI with:

- `ask <repoPath> <question...>`
- `explain <filePath>`
- `plan <repoPath> <request...>`

### `src/ask.ts`

Contains the core repository-question answering logic:

- file scoring
- chunk scoring
- hybrid retrieval
- formatting context for the model
- final OpenAI request

### `src/chunkFiles.ts`

Defines `FileChunk` and a chunking helper with overlap.

### `src/index.ts`

A simpler standalone entry point for asking a question directly from the command line.

## Notes

- The repository context suggests the app is focused on codebase intelligence rather than general chat.
- `src/ask.ts` is specifically designed to ground answers in retrieved repository content.
- `src/cli.ts` currently imports `dotenv/config`, so environment variables are loaded automatically when the CLI runs.
- I did not find `src/loadFiles.ts` or `src/embeddings.ts` in the provided repository context, but they are imported and are required for the app to work. The README may need to be updated once those files are available to document their behavior precisely.

# Code Agent

A TypeScript CLI for analyzing repositories with OpenAI. It can answer questions about a codebase, explain files, and suggest implementation plans based on repository contents.

## Features

- Ask questions about a repo
- Explain individual files
- Suggest which files should change for a feature request
- Hybrid retrieval using keyword matching + embeddings
- Context-grounded responses from OpenAI

## Requirements

- Node.js 20+
- OpenAI API key

## Setup

```bash
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=your_api_key_here
```

## Scripts

- `npm run cli` — run the CLI with tsx
- `npm run build` — compile TypeScript
- `npm run watch` — watch TypeScript compilation

## Binary

After building, the package exposes:

- `code-agent`

## Project structure

- `src/cli.ts` — CLI commands
- `src/ask.ts` — repository QA and retrieval
- `src/chunkFiles.ts` — file chunking
- `src/index.ts` — direct CLI entry point
