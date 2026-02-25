import type { DetectionCategory, Finding, Severity } from "../types";
import {
  piiPatterns,
  secretPatterns,
  promptInjectionPatterns,
  unsafeAiUsagePatterns,
} from "./patterns";

type RawMatch = {
  category: DetectionCategory;
  match: string;
  start: number;
  end: number;
  message?: string;
};

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

function getEndLineAndColumn(text: string, offset: number): { line: number; column: number } {
  return getLineAndColumn(text, offset);
}

const severityMap: Partial<Record<DetectionCategory, Severity>> = {
  ssn: "error",
  credit_card: "error",
  private_key: "error",
  aws_key: "error",
  github_token: "error",
  generic_api_key: "error",
  connection_string: "error",
  env_secret: "error",
  prompt_injection: "warning",
  unsafe_ai_usage: "warning",
  email: "warning",
  phone: "warning",
  ip_address: "info",
  address: "info",
  date_of_birth: "info",
  name: "info",
};

const messageMap: Partial<Record<DetectionCategory, string>> = {
  email: "Email address detected",
  phone: "Phone number detected",
  ssn: "Social Security Number detected",
  credit_card: "Credit card number detected",
  ip_address: "IP address detected",
  address: "Physical address detected",
  date_of_birth: "Date of birth detected",
  aws_key: "AWS access key detected",
  github_token: "GitHub token detected",
  generic_api_key: "API key or secret detected",
  private_key: "Private key detected",
  connection_string: "Database connection string detected",
  env_secret: "Hardcoded secret detected",
  prompt_injection: "Potential prompt injection pattern detected",
  unsafe_ai_usage: "Unsafe AI SDK usage pattern",
};

function dedupeMatches(matches: RawMatch[]): RawMatch[] {
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const deduped: RawMatch[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      deduped.push(m);
      lastEnd = m.end;
    }
  }
  return deduped;
}

function runPatterns(
  text: string,
  patterns: RegExp[],
  category: DetectionCategory,
  message?: string,
): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      matches.push({
        category,
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
        message,
      });
    }
  }
  return matches;
}

export type DetectorOptions = {
  categories?: DetectionCategory[];
};

const defaultCategories: DetectionCategory[] = [
  "email", "phone", "ssn", "credit_card", "ip_address", "address", "date_of_birth",
  "aws_key", "github_token", "generic_api_key", "private_key", "connection_string", "env_secret",
  "prompt_injection", "unsafe_ai_usage",
];

export function detectFindings(
  text: string,
  file: string,
  options: DetectorOptions = {},
): Finding[] {
  const categories = options.categories ?? defaultCategories;
  const allMatches: RawMatch[] = [];

  for (const category of categories) {
    if (category === "name") continue;

    // PII patterns
    if (category in piiPatterns) {
      const patterns = piiPatterns[category as keyof typeof piiPatterns];
      if (patterns?.length) {
        allMatches.push(...runPatterns(text, patterns, category));
      }
    }

    // Secret patterns
    if (category in secretPatterns) {
      const patterns = secretPatterns[category as keyof typeof secretPatterns];
      if (patterns?.length) {
        allMatches.push(...runPatterns(text, patterns, category));
      }
    }

    // Prompt injection
    if (category === "prompt_injection") {
      allMatches.push(...runPatterns(text, promptInjectionPatterns, "prompt_injection"));
    }

    // Unsafe AI usage
    if (category === "unsafe_ai_usage") {
      for (const { pattern, message } of unsafeAiUsagePatterns) {
        allMatches.push(...runPatterns(text, [pattern], "unsafe_ai_usage", message));
      }
    }
  }

  const deduped = dedupeMatches(allMatches);

  return deduped.map((m) => {
    const start = getLineAndColumn(text, m.start);
    const end = getEndLineAndColumn(text, m.end);
    return {
      ruleId: `grepture/${m.category.replace(/_/g, "-")}`,
      category: m.category,
      severity: severityMap[m.category] ?? "warning",
      message: m.message ?? messageMap[m.category] ?? `${m.category} detected`,
      file,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
      match: m.match,
    };
  });
}
