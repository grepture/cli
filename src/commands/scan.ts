import type { Command } from "commander";
import chalk from "chalk";
import * as path from "path";
import * as fs from "fs";
import { loadConfig, isAuthenticated } from "../config";
import { discoverFiles, scanFiles, filterBySeverity } from "../scanner";
import { loadCloudRules, extractChecksFromRules } from "../cloud-scanner";
import { formatText } from "../output/text";
import { formatJson } from "../output/json";
import { formatSarif } from "../output/sarif";
import type { OutputFormat, Severity } from "../types";
import { applyFixes } from "./fix";

export function registerScanCommand(program: Command) {
  program
    .command("scan")
    .description("Scan files for AI security risks")
    .argument("[path]", "File or directory to scan", ".")
    .option("-f, --format <format>", "Output format: text, json, sarif", "text")
    .option("-s, --severity <level>", "Minimum severity to report: error, warning, info")
    .option("--fix", "Auto-fix fixable issues (redact PII, remove secrets)")
    .option("--no-colors", "Disable colored output")
    .action(async (targetPath: string, options: {
      format: OutputFormat;
      severity?: Severity;
      fix?: boolean;
      colors?: boolean;
    }) => {
      const cwd = process.cwd();
      const config = loadConfig(cwd);
      const resolvedPath = path.resolve(cwd, targetPath);

      if (!fs.existsSync(resolvedPath)) {
        console.error(chalk.red(`Error: Path not found: ${resolvedPath}`));
        process.exit(1);
      }

      const severity = options.severity ?? config?.scan?.severity ?? "info";
      const files = await discoverFiles(resolvedPath, config);

      if (files.length === 0) {
        console.log(chalk.yellow("\n  No files found to scan.\n"));
        process.exit(0);
      }

      // Load cloud rules if authenticated
      const cloudRules = isAuthenticated() ? loadCloudRules() : [];
      const cloudChecks = extractChecksFromRules(cloudRules);

      // Show scanning message for text format
      if (options.format === "text") {
        console.log(chalk.dim(`\n  Scanning ${files.length} file${files.length !== 1 ? "s" : ""}...\n`));
        if (cloudChecks.length > 0) {
          console.log(chalk.dim(`  Cloud AI scanning enabled (${cloudChecks.join(", ")})\n`));
        }
      }

      let result = await scanFiles(files, undefined, cloudRules.length > 0 ? cloudRules : undefined);
      result = filterBySeverity(result, severity);

      if (options.fix && result.totalFindings > 0) {
        const fixCount = applyFixes(result);
        if (fixCount > 0 && options.format === "text") {
          console.log(chalk.green(`  Fixed ${fixCount} issue${fixCount !== 1 ? "s" : ""}.\n`));
        }
        // Re-scan to show remaining findings
        result = await scanFiles(files);
        result = filterBySeverity(result, severity);
      }

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

      // Exit with code 1 if errors found
      if (result.bySeverity.error > 0) {
        process.exit(1);
      }
    });
}
