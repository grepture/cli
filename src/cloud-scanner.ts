import * as fs from "fs";
import * as path from "path";
import { loadConfig, loadCredentials, PROXY_URL } from "./config";
import type { Rule, RuleAction, Finding, CloudScanSummary, CloudCategory } from "./types";

const MAX_FILES_PER_REQUEST = 50;
const MAX_FILE_BYTES = 51_200; // 50KB

// Map AI action types to scan check names
const ACTION_TO_CHECK: Record<string, CloudCategory> = {
  ai_detect_pii: "ai_pii",
  ai_detect_injection: "injection",
  ai_detect_toxicity: "toxicity",
  ai_detect_dlp: "dlp",
  ai_detect_compliance: "compliance",
};

type PiiMatch = { category: string; match: string; start: number; end: number };
type ClassificationCategory = { category: string; score: number };

type ScanFileResult = {
  path: string;
  results: Record<string, unknown>;
  skipped?: string;
};

type ScanFilesResponse = {
  files: ScanFileResult[];
  tier: string;
  checks_run: string[];
  checks_skipped: Array<{ check: string; reason: string }>;
};

export function loadCloudRules(): Rule[] {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const rulesDir = config?.rules?.local ?? ".grepture/rules/";
  const filePath = path.resolve(cwd, rulesDir, "cloud.json");
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export function extractChecksFromRules(rules: Rule[]): CloudCategory[] {
  const checks = new Set<CloudCategory>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const action of rule.actions) {
      if (!action.enabled) continue;
      const check = ACTION_TO_CHECK[action.type];
      if (check) checks.add(check);
    }
  }
  return [...checks];
}

function getLineAndColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

function convertPiiFindings(
  filePath: string,
  text: string,
  matches: PiiMatch[],
): Finding[] {
  return matches.map((m) => {
    const start = getLineAndColumn(text, m.start);
    const end = getLineAndColumn(text, m.end);
    return {
      ruleId: `grepture/ai-pii`,
      category: "ai_pii" as CloudCategory,
      severity: "warning" as const,
      message: `AI-detected PII: ${m.category} — "${m.match}"`,
      file: filePath,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      match: m.match,
      fix: `[${m.category.toUpperCase()}_REDACTED]`,
    };
  });
}

function convertClassificationFinding(
  filePath: string,
  check: CloudCategory,
  categories: ClassificationCategory[],
): Finding[] {
  if (categories.length === 0) return [];

  const labels: Record<string, string> = {
    injection: "Prompt injection detected",
    toxicity: "Toxic content detected",
    dlp: "Sensitive data detected",
    compliance: "Compliance issue detected",
  };

  return [{
    ruleId: `grepture/${check}`,
    category: check,
    severity: "warning" as const,
    message: `${labels[check] ?? `${check} detected`}: ${categories.map((c) => c.category).join(", ")}`,
    file: filePath,
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 1,
    match: categories.map((c) => c.category).join(", "),
  }];
}

function convertFileResults(
  filePath: string,
  text: string,
  results: Record<string, unknown>,
): Finding[] {
  const findings: Finding[] = [];

  for (const [check, result] of Object.entries(results)) {
    if (!result || typeof result !== "object") continue;
    const r = result as Record<string, unknown>;

    // Skip skipped results
    if ("skipped" in r && r.skipped === true) continue;

    if (check === "ai_pii" && "matches" in r) {
      const matches = r.matches as PiiMatch[];
      findings.push(...convertPiiFindings(filePath, text, matches));
    } else if ("detected" in r && r.detected === true && "matched_categories" in r) {
      const categories = r.matched_categories as ClassificationCategory[];
      findings.push(...convertClassificationFinding(filePath, check as CloudCategory, categories));
    }
  }

  return findings;
}

export type CloudScanResult = {
  findingsByFile: Map<string, Finding[]>;
  summary: CloudScanSummary;
};

export async function cloudScanFiles(
  files: Array<{ path: string; text: string }>,
  cloudRules: Rule[],
): Promise<CloudScanResult | null> {
  const creds = loadCredentials();
  if (!creds?.token) return null;

  const checks = extractChecksFromRules(cloudRules);
  if (checks.length === 0) return null;

  // Split files into batches, skipping oversized files
  const encoder = new TextEncoder();
  const validFiles: Array<{ path: string; text: string }> = [];
  let skippedCount = 0;

  for (const file of files) {
    const bytes = encoder.encode(file.text).length;
    if (bytes > MAX_FILE_BYTES) {
      skippedCount++;
    } else {
      validFiles.push(file);
    }
  }

  const findingsByFile = new Map<string, Finding[]>();
  let tier = "";
  let checksRun: string[] = [];
  let checksSkipped: Array<{ check: string; reason: string }> = [];

  // Process in batches
  for (let i = 0; i < validFiles.length; i += MAX_FILES_PER_REQUEST) {
    const batch = validFiles.slice(i, i + MAX_FILES_PER_REQUEST);

    try {
      const res = await fetch(`${PROXY_URL}/v1/scan-files`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: batch, checks }),
      });

      if (!res.ok) {
        // Auth error or server error — skip cloud scanning silently
        console.error(`Cloud scan failed: ${res.status} ${res.statusText}`);
        return null;
      }

      const data = (await res.json()) as ScanFilesResponse;
      tier = data.tier;
      checksRun = data.checks_run;
      checksSkipped = data.checks_skipped;

      for (const fileResult of data.files) {
        if (fileResult.skipped) {
          skippedCount++;
          continue;
        }

        // Find the original text for line/column computation
        const original = batch.find((f) => f.path === fileResult.path);
        if (!original) continue;

        const findings = convertFileResults(fileResult.path, original.text, fileResult.results);
        if (findings.length > 0) {
          const existing = findingsByFile.get(fileResult.path) ?? [];
          existing.push(...findings);
          findingsByFile.set(fileResult.path, existing);
        }
      }
    } catch (err) {
      // Network error — skip cloud scanning silently
      console.error(`Cloud scan error: ${err instanceof Error ? err.message : "Unknown error"}`);
      return null;
    }
  }

  const summary: CloudScanSummary = {
    tier,
    checksRun,
    checksSkipped,
    filesScanned: validFiles.length,
    filesSkipped: skippedCount,
  };

  return { findingsByFile, summary };
}
