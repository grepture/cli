import type { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import type { Rule } from "../types";
import { loadConfig, isAuthenticated } from "../config";
import { defaultRules } from "../rules/defaults";
import { discoverFiles, scanFiles, filterBySeverity } from "../scanner";
import { formatText } from "../output/text";

function loadLocalRules(): Rule[] {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const rulesDir = config?.rules?.local ?? ".grepture/rules/";
  const absDir = path.resolve(cwd, rulesDir);

  const rules: Rule[] = [];

  if (!fs.existsSync(absDir)) return defaultRules;

  try {
    const files = fs.readdirSync(absDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(absDir, file), "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        rules.push(...parsed);
      } else {
        rules.push(parsed);
      }
    }
  } catch {
    // fallback to defaults
    return defaultRules;
  }

  return rules.length > 0 ? rules : defaultRules;
}

export function registerRulesCommand(program: Command) {
  const rules = program
    .command("rules")
    .description("Manage detection rules");

  rules
    .command("list")
    .description("Show active rules (local + cloud)")
    .action(async () => {
      const localRules = loadLocalRules();

      console.log(chalk.bold("\n  Local Rules\n"));

      if (localRules.length === 0) {
        console.log(chalk.dim("  No local rules found.\n"));
      } else {
        for (const rule of localRules) {
          const status = rule.enabled ? chalk.green("enabled") : chalk.dim("disabled");
          const actions = rule.actions.map((a) => a.type).join(", ");
          console.log(`  ${status}  ${chalk.bold(rule.name)} ${chalk.dim(`(${rule.id})`)}`);
          console.log(`         ${chalk.dim(rule.description)}`);
          console.log(`         ${chalk.dim(`Actions: ${actions}  |  Apply to: ${rule.apply_to}`)}`);
          console.log("");
        }
      }

      if (isAuthenticated()) {
        console.log(chalk.bold("  Cloud Rules\n"));
        console.log(chalk.dim("  Use `grepture rules pull` to sync team rules.\n"));
      } else {
        console.log(chalk.dim("  Log in with `grepture login` to access cloud rules.\n"));
      }

      // Show built-in detection categories
      console.log(chalk.bold("  Built-in Detection (always active)\n"));
      const categories = [
        { name: "PII", items: "email, phone, SSN, credit card, IP, address, DOB" },
        { name: "Secrets", items: "AWS keys, GitHub tokens, API keys, private keys, connection strings" },
        { name: "AI Security", items: "prompt injection patterns, unsafe SDK usage" },
      ];
      for (const cat of categories) {
        console.log(`  ${chalk.cyan(cat.name)}: ${chalk.dim(cat.items)}`);
      }
      console.log("");
    });

  rules
    .command("test")
    .description("Test rules against a sample file")
    .argument("<file>", "File to test rules against")
    .action(async (file: string) => {
      const resolved = path.resolve(file);
      if (!fs.existsSync(resolved)) {
        console.error(chalk.red(`\n  Error: File not found: ${file}\n`));
        process.exit(1);
      }

      console.log(chalk.dim(`\n  Testing rules against: ${file}\n`));

      const result = await scanFiles([resolved]);

      if (result.totalFindings === 0) {
        console.log(chalk.green("  No findings — file is clean.\n"));
      } else {
        console.log(formatText(result, process.cwd()));
      }
    });

  rules
    .command("add")
    .description("Create a new rule (requires authentication)")
    .action(async () => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }
      console.log(chalk.yellow("\n  Interactive rule creation coming soon.\n"));
    });

  rules
    .command("pull")
    .description("Pull team rules from cloud")
    .action(async () => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }
      console.log(chalk.yellow("\n  Cloud rules sync coming soon.\n"));
    });

  rules
    .command("push")
    .description("Push local rules to cloud")
    .action(async () => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }
      console.log(chalk.yellow("\n  Cloud rules sync coming soon.\n"));
    });
}
