"use strict";

/**
 * Offline, dependency-free heuristic scan of a unified diff — runs even if
 * the AvalonLabs API call fails or is skipped, so the Action always has
 * *something* concrete to say. Deliberately regex/line-based, not a real
 * parser or AST diff: matches the product's own "AST/heuristic tools"
 * framing (SQL Optimizer, API Analyzer) at v1 scope — approximate signal,
 * not a query planner or a type-aware auth analysis. False positives and
 * false negatives are both expected; every finding is worded as "possible"/
 * "worth a look", never a certainty.
 */

const ROUTE_DEFINITION_PATTERN =
  /\b(?:app|router|fastify)\.(?:get|post|put|patch|delete)\s*\(|export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\s*\(/;

const AUTH_MARKER_PATTERN =
  /requireAuth|isAuthenticated|authMiddleware|verifyToken|getServerSession|withAuth|ensureAuthenticated|checkAuth|@UseGuards|getUser\s*\(|session\.user|auth\(\)/;

const SELECT_STAR_PATTERN = /select\s+\*\s+from/i;
const WHERE_CLAUSE_PATTERN = /where\s+([a-zA-Z0-9_."]+)\s*[=<>]/gi;
const INDEX_DEFINITION_PATTERN = /create\s+index|@@index\(|@index\(|\.index\(/i;
const LIMIT_PATTERN = /\blimit\b/i;

/**
 * Parses a unified diff into per-file added/removed line lists, each tagged
 * with its line number in the relevant file version (new-file numbering for
 * additions, old-file numbering for removals) so findings can point at a
 * real line. Ignores binary-file diffs and the `+++`/`---` file headers
 * themselves.
 */
function parseDiff(diffText) {
  const files = [];
  let current = null;
  let newLineNumber = 0;
  let oldLineNumber = 0;

  for (const rawLine of diffText.split("\n")) {
    const fileHeaderMatch = /^\+\+\+ (?:b\/)?(.+)$/.exec(rawLine);
    if (fileHeaderMatch) {
      current = { file: fileHeaderMatch[1], added: [], removed: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;

    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunkMatch) {
      oldLineNumber = parseInt(hunkMatch[1], 10);
      newLineNumber = parseInt(hunkMatch[2], 10);
      continue;
    }

    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;

    if (rawLine.startsWith("+")) {
      current.added.push({ line: newLineNumber, content: rawLine.slice(1) });
      newLineNumber++;
    } else if (rawLine.startsWith("-")) {
      current.removed.push({ line: oldLineNumber, content: rawLine.slice(1) });
      oldLineNumber++;
    } else {
      newLineNumber++;
      oldLineNumber++;
    }
  }

  return files;
}

/**
 * Flags two shapes of auth regression risk:
 * 1. A new route/handler definition added with no auth-guard-looking
 *    identifier anywhere else in that file's added lines (a real check may
 *    exist further away than this diff shows, e.g. applied at the router or
 *    middleware-stack level — this can't see that, hence "worth a look").
 * 2. A removed line matching a known auth-guard identifier where the same
 *    file's added lines don't also contain one — the closest static signal
 *    to "an auth check that used to be here is gone now".
 */
function findAuthRegressionRisks(files) {
  const findings = [];

  for (const file of files) {
    const addedText = file.added.map((l) => l.content).join("\n");
    const fileHasAuthMarkerAdded = AUTH_MARKER_PATTERN.test(addedText);

    for (const { line, content } of file.added) {
      if (ROUTE_DEFINITION_PATTERN.test(content) && !fileHasAuthMarkerAdded) {
        findings.push({
          type: "missing-auth-check",
          severity: "warning",
          file: file.file,
          line,
          message: `New route/handler added with no auth-guard call found in this file's diff: \`${content.trim().slice(0, 100)}\``,
        });
      }
    }

    for (const { line, content } of file.removed) {
      if (AUTH_MARKER_PATTERN.test(content) && !fileHasAuthMarkerAdded) {
        findings.push({
          type: "auth-check-removed",
          severity: "critical",
          file: file.file,
          line,
          message: `Removed line looks like an auth check, with no replacement added in this file's diff: \`${content.trim().slice(0, 100)}\``,
        });
      }
    }
  }

  return findings;
}

/**
 * Flags two shapes of query-indexing risk within added lines only:
 * 1. `SELECT * FROM ...` with no `LIMIT` on the same line — classic
 *    full-table-scan shape.
 * 2. A `WHERE column = ...` filter where no `CREATE INDEX`/`@@index`/
 *    `.index(` mentioning that column appears anywhere else in the whole
 *    diff. This cannot know about indexes that already exist outside the
 *    diff — it only means "this diff doesn't show one for this column",
 *    which is why every message below is phrased as a prompt to verify, not
 *    a claim that no index exists.
 */
function findUnindexedQueryRisks(files) {
  const findings = [];
  const wholeDiffAddedText = files.map((f) => f.added.map((l) => l.content).join("\n")).join("\n");

  for (const file of files) {
    for (const { line, content } of file.added) {
      if (SELECT_STAR_PATTERN.test(content) && !LIMIT_PATTERN.test(content)) {
        findings.push({
          type: "full-table-scan-shape",
          severity: "warning",
          file: file.file,
          line,
          message: `\`SELECT *\` with no \`LIMIT\` on this line — check whether this can scan the full table: \`${content.trim().slice(0, 100)}\``,
        });
      }

      let match;
      WHERE_CLAUSE_PATTERN.lastIndex = 0;
      while ((match = WHERE_CLAUSE_PATTERN.exec(content))) {
        const column = match[1];
        const columnPattern = new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        if (!INDEX_DEFINITION_PATTERN.test(wholeDiffAddedText) || !columnPattern.test(wholeDiffAddedText)) {
          findings.push({
            type: "unindexed-filter",
            severity: "info",
            file: file.file,
            line,
            message: `Filters on \`${column}\` with no matching index added in this diff — verify one already exists: \`${content.trim().slice(0, 100)}\``,
          });
        }
      }
    }
  }

  return findings;
}

/** Runs both heuristic scans over a raw unified diff string. */
function runHeuristics(diffText) {
  const files = parseDiff(diffText);
  return [...findAuthRegressionRisks(files), ...findUnindexedQueryRisks(files)];
}

module.exports = { parseDiff, findAuthRegressionRisks, findUnindexedQueryRisks, runHeuristics };
