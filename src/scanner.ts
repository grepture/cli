import { Glob } from "bun";
import * as path from "path";
import * as fs from "fs";
import ignore from "ignore";
import type { Finding, FileScanResult, ScanResult, Severity, GrepturConfig, Rule } from "./types";
import { detectFindings, type DetectorOptions } from "./detection/detector";
import { cloudScanFiles } from "./cloud-scanner";

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
): Promise<FileScanResult & { text: string }> {
  const text = await Bun.file(filePath).text();
  const findings = detectFindings(text, filePath, options);
  return { file: filePath, findings, text };
}

export async function scanFiles(
  files: string[],
  options?: DetectorOptions,
  cloudRules?: Rule[],
): Promise<ScanResult> {
  const fileResults: FileScanResult[] = [];
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  let totalFindings = 0;

  // Local regex scanning — collect text for cloud scanning
  const fileTexts: Array<{ path: string; text: string }> = [];
  const resultsByPath = new Map<string, FileScanResult>();

  for (const file of files) {
    const result = await scanFile(file, options);
    fileTexts.push({ path: file, text: result.text });
    resultsByPath.set(file, { file: result.file, findings: [...result.findings] });
  }

  // Cloud AI scanning
  let cloudSummary;
  if (cloudRules && cloudRules.length > 0) {
    const cloudResult = await cloudScanFiles(fileTexts, cloudRules);
    if (cloudResult) {
      cloudSummary = cloudResult.summary;
      // Merge cloud findings into results
      for (const [filePath, cloudFindings] of cloudResult.findingsByFile) {
        const existing = resultsByPath.get(filePath);
        if (existing) {
          existing.findings.push(...cloudFindings);
        } else {
          resultsByPath.set(filePath, { file: filePath, findings: cloudFindings });
        }
      }
    }
  }

  // Aggregate results
  for (const result of resultsByPath.values()) {
    if (result.findings.length > 0) {
      fileResults.push(result);
      totalFindings += result.findings.length;
      for (const f of result.findings) {
        byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
        bySeverity[f.severity]++;
      }
    }
  }

  return { files: fileResults, totalFindings, byCategory, bySeverity, cloudSummary };
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

  return { files: filtered, totalFindings, byCategory, bySeverity, cloudSummary: result.cloudSummary };
}
