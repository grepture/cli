import { Glob } from "bun";
import * as path from "path";
import * as fs from "fs";
import ignore from "ignore";
import type { Finding, FileScanResult, ScanResult, Severity, GrepturConfig } from "./types";
import { detectFindings, type DetectorOptions } from "./detection/detector";

// Default exclude patterns (always excluded)
const defaultExcludes = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".env.local",
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.svg",
  "*.ico",
  "*.woff",
  "*.woff2",
  "*.ttf",
  "*.eot",
  "*.mp3",
  "*.mp4",
  "*.webm",
  "*.webp",
  "*.zip",
  "*.tar",
  "*.gz",
  "*.pdf",
  "*.wasm",
];

function loadIgnoreFile(dir: string): ReturnType<typeof ignore> | null {
  const ignorePath = path.join(dir, ".greptureignore");
  if (fs.existsSync(ignorePath)) {
    const content = fs.readFileSync(ignorePath, "utf-8");
    return ignore().add(content);
  }
  return null;
}

export async function discoverFiles(
  targetPath: string,
  config?: GrepturConfig,
): Promise<string[]> {
  const absTarget = path.resolve(targetPath);
  const stat = fs.statSync(absTarget);

  if (stat.isFile()) {
    return [absTarget];
  }

  const includePatterns = config?.scan?.paths?.include ?? ["**/*"];
  const excludePatterns = [
    ...defaultExcludes,
    ...(config?.scan?.paths?.exclude ?? []),
  ];

  const ig = ignore().add(excludePatterns);
  const grepturIgnore = loadIgnoreFile(absTarget);

  const files: string[] = [];

  for (const pattern of includePatterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd: absTarget, dot: false })) {
      const relPath = file;
      if (ig.ignores(relPath)) continue;
      if (grepturIgnore?.ignores(relPath)) continue;

      const fullPath = path.join(absTarget, relPath);
      try {
        const fileStat = fs.statSync(fullPath);
        if (!fileStat.isFile()) continue;
        // Skip binary/large files (> 1MB)
        if (fileStat.size > 1_000_000) continue;
      } catch {
        continue;
      }

      files.push(fullPath);
    }
  }

  return [...new Set(files)].sort();
}

export async function scanFile(
  filePath: string,
  options?: DetectorOptions,
): Promise<FileScanResult> {
  const text = await Bun.file(filePath).text();
  const findings = detectFindings(text, filePath, options);
  return { file: filePath, findings };
}

export async function scanFiles(
  files: string[],
  options?: DetectorOptions,
): Promise<ScanResult> {
  const results: FileScanResult[] = [];
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  let totalFindings = 0;

  for (const file of files) {
    const result = await scanFile(file, options);
    if (result.findings.length > 0) {
      results.push(result);
      totalFindings += result.findings.length;
      for (const f of result.findings) {
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
        bySeverity[f.severity]++;
      }
    }
  }

  return { files: results, totalFindings, byCategory, bySeverity };
}

export function filterBySeverity(result: ScanResult, minSeverity: Severity): ScanResult {
  const severityOrder: Record<Severity, number> = { error: 2, warning: 1, info: 0 };
  const minLevel = severityOrder[minSeverity];

  const filtered: FileScanResult[] = [];
  let totalFindings = 0;
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };

  for (const fileResult of result.files) {
    const findings = fileResult.findings.filter(
      (f) => severityOrder[f.severity] >= minLevel,
    );
    if (findings.length > 0) {
      filtered.push({ file: fileResult.file, findings });
      totalFindings += findings.length;
      for (const f of findings) {
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
        bySeverity[f.severity]++;
      }
    }
  }

  return { files: filtered, totalFindings, byCategory, bySeverity };
}
