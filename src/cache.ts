import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Location of the cache file on disk.
 */
const CACHE_DIR = path.join(process.cwd(), ".code-agent-cache");
const CACHE_FILE = path.join(CACHE_DIR, "embeddings.json");

/**
 * Shape of a cached chunk embedding.
 */
export type CachedEmbedding = {
  chunkId: string;
  filePath: string;
  chunkIndex: number;
  textHash: string;
  embedding: number[];
};

/**
 * Shape of a cached file embedding.
 */
export type CachedFileEmbedding = {
  filePath: string;
  textHash: string;
  embedding: number[];
};

/**
 * Entire cache structure.
 */
export type EmbeddingCache = {
  chunks: Record<string, CachedEmbedding>; // keyed by chunkId
  files: Record<string, CachedFileEmbedding>; // keyed by filePath
};

/**
 * Ensure cache directory exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Load cache from disk.
 * Returns empty cache if file does not exist.
 */
export function loadEmbeddingCache(): EmbeddingCache {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return { chunks: {}, files: {} };
    }

    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<EmbeddingCache> | null;

    return {
      chunks:
        parsed?.chunks && typeof parsed.chunks === "object"
          ? parsed.chunks
          : {},
      files:
        parsed?.files && typeof parsed.files === "object" ? parsed.files : {},
    };
  } catch (err) {
    console.warn("⚠️ Failed to load cache, starting fresh");
    return { chunks: {}, files: {} };
  }
}

/**
 * Save cache to disk.
 */
export function saveEmbeddingCache(cache: EmbeddingCache) {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️ Failed to save cache");
  }
}

/**
 * Create a stable hash for a chunk's text.
 * Used to detect when content has changed.
 */
export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
