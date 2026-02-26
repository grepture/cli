import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import type { ScanResult, Finding, Severity, CloudScanSummary } from "../types";

const severityColors: Record<Severity, (s: string) => string> = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
};

const severityIcons: Record<Severity, string> = {
  error: "E",
  warning: "W",
  info: "I",
};

function getSourceLine(filePath: string, line: number): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    if (line >= 1 && line <= lines.length) {
      return lines[line - 1];
    }
  } catch {
    // ignore
  }
  return null;
}

function formatFinding(finding: Finding, cwd: string): string {
  const relPath = path.relative(cwd, finding.file);
  const color = severityColors[finding.severity];
  const icon = severityIcons[finding.severity];
  const lines: string[] = [];

  // Header: file:line:col severity [rule-id]
  lines.push(
    `  ${chalk.cyan(relPath)}:${chalk.yellow(String(finding.line))}:${chalk.yellow(String(finding.column))} ` +
    `${color(finding.severity)} ${chalk.dim(`[${finding.ruleId}]`)}`
  );

  // Message
  lines.push(`  ${color(icon)} ${finding.message}`);

  // Source context
  const sourceLine = getSourceLine(finding.file, finding.line);
  if (sourceLine) {
    lines.push(chalk.dim(`  ${String(finding.line).padStart(4)} | `) + sourceLine);
    // Underline the match
    const underlineStart = finding.column - 1;
    const underlineLen = Math.max(1, finding.match.length);
    const padding = " ".repeat(underlineStart);
    lines.push(chalk.dim("       | ") + padding + color("~".repeat(Math.min(underlineLen, 80))));
  }

  return lines.join("\n");
}

export function formatText(result: ScanResult, cwd: string): string {
  if (result.totalFindings === 0) {
    return chalk.green("\n  No issues found.\n");
  }

  const lines: string[] = [];
  lines.push("");

  for (const fileResult of result.files) {
    for (const finding of fileResult.findings) {
      lines.push(formatFinding(finding, cwd));
      lines.push("");
    }
  }

  // Summary
  lines.push(chalk.dim("  ─".repeat(30)));
  const parts: string[] = [];
  if (result.bySeverity.error > 0) {
    parts.push(chalk.red(`${result.bySeverity.error} error${result.bySeverity.error !== 1 ? "s" : ""}`));
  }
  if (result.bySeverity.warning > 0) {
    parts.push(chalk.yellow(`${result.bySeverity.warning} warning${result.bySeverity.warning !== 1 ? "s" : ""}`));
  }
  if (result.bySeverity.info > 0) {
    parts.push(chalk.blue(`${result.bySeverity.info} info`));
  }
  lines.push(`  ${result.totalFindings} finding${result.totalFindings !== 1 ? "s" : ""} (${parts.join(", ")})`);

  if (result.cloudSummary) {
    lines.push("");
    lines.push(formatCloudSummary(result.cloudSummary));
  }

  lines.push("");

  return lines.join("\n");
}

function formatCloudSummary(summary: CloudScanSummary): string {
  const lines: string[] = [];
  lines.push(chalk.dim("  Cloud AI scan:"));
  lines.push(chalk.dim(`    Tier: ${summary.tier}  |  Files: ${summary.filesScanned} scanned, ${summary.filesSkipped} skipped`));

  if (summary.checksRun.length > 0) {
    lines.push(chalk.dim(`    Checks run: ${summary.checksRun.join(", ")}`));
  }

  if (summary.checksSkipped.length > 0) {
    const skippedParts = summary.checksSkipped.map(
      (s) => `${s.check} (${s.reason.replace(/_/g, " ")})`
    );
    lines.push(chalk.dim(`    Checks skipped: ${skippedParts.join(", ")}`));
  }

  return lines.join("\n");
}
