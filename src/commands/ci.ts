import type { Command } from "commander";
import chalk from "chalk";
import * as path from "path";
import { loadConfig } from "../config";
import { discoverFiles, scanFiles, filterBySeverity } from "../scanner";
import { formatJson } from "../output/json";
import { formatSarif } from "../output/sarif";
import { formatText } from "../output/text";
import type { OutputFormat, Severity } from "../types";

async function getChangedFiles(baseBranch?: string): Promise<string[]> {
  const base = baseBranch ?? "main";
  try {
    const proc = Bun.spawn(["git", "diff", "--name-only", "--diff-filter=ACM", `${base}...HEAD`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode !== 0) {
      // Try origin/main
      const proc2 = Bun.spawn(["git", "diff", "--name-only", "--diff-filter=ACM", `origin/${base}...HEAD`], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output2 = await new Response(proc2.stdout).text();
      await proc2.exited;
      if (proc2.exitCode !== 0) return [];
      return output2.trim().split("\n").filter(Boolean).map((f) => path.resolve(f));
    }
    return output.trim().split("\n").filter(Boolean).map((f) => path.resolve(f));
  } catch {
    return [];
  }
}

export function registerCiCommand(program: Command) {
  program
    .command("ci")
    .description("CI-optimized scan (SARIF/JSON output, exit codes)")
    .option("-f, --format <format>", "Output format: text, json, sarif", "sarif")
    .option("-s, --severity <level>", "Minimum severity: error, warning, info", "warning")
    .option("--all", "Scan all files, not just PR diff")
    .option("--base <branch>", "Base branch for diff comparison", "main")
    .action(async (options: {
      format: OutputFormat;
      severity: Severity;
      all?: boolean;
      base: string;
    }) => {
      const cwd = process.cwd();
      const config = loadConfig(cwd);

      let files: string[];
      if (options.all) {
        files = await discoverFiles(cwd, config);
      } else {
        files = await getChangedFiles(options.base);
        if (files.length === 0) {
          // Fallback to full scan if no diff available
          files = await discoverFiles(cwd, config);
        }
      }

      if (files.length === 0) {
        if (options.format === "text") {
          console.log("No files to scan.");
        }
        process.exit(0);
      }

      let result = await scanFiles(files);
      result = filterBySeverity(result, options.severity);

      switch (options.format) {
        case "json":
          console.log(formatJson(result, cwd));
          break;
        case "sarif":
          console.log(formatSarif(result, cwd));
          break;
        default:
          console.log(formatText(result, cwd));
      }

      // CI exit code: 1 if any findings at or above severity threshold
      if (result.totalFindings > 0) {
        process.exit(1);
      }
    });
}
