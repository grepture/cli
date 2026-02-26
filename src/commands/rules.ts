import type { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import type { Rule } from "../types";
import { loadConfig, isAuthenticated, loadCredentials, CLOUD_URL } from "../config";
import { defaultRules } from "../rules/defaults";
import { loadCloudRules } from "../cloud-scanner";
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

function cloudRulesPath(): string {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const rulesDir = config?.rules?.local ?? ".grepture/rules/";
  return path.resolve(cwd, rulesDir, "cloud.json");
}

function printRule(rule: Rule) {
  const status = rule.enabled ? chalk.green("enabled") : chalk.dim("disabled");
  const actions = rule.actions.map((a) => a.type).join(", ");
  console.log(`  ${status}  ${chalk.bold(rule.name)} ${chalk.dim(`(${rule.id})`)}`);
  console.log(`         ${chalk.dim(rule.description)}`);
  console.log(`         ${chalk.dim(`Actions: ${actions}  |  Apply to: ${rule.apply_to}`)}`);
  console.log("");
}

async function apiRequest(method: string, urlPath: string, body?: unknown): Promise<Response> {
  const creds = loadCredentials();
  if (!creds?.token) throw new Error("Not authenticated");

  const url = `${CLOUD_URL}${urlPath}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${creds.token}`,
    "Content-Type": "application/json",
  };

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
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
          printRule(rule);
        }
      }

      const cloudRules = loadCloudRules();
      if (cloudRules.length > 0) {
        console.log(chalk.bold("  Cloud Rules\n"));
        for (const rule of cloudRules) {
          printRule(rule);
        }
      } else if (isAuthenticated()) {
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

      console.log(chalk.dim("\n  Fetching cloud rules...\n"));

      try {
        const res = await apiRequest("GET", "/api/rules");
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
          console.error(chalk.red(`  Error: ${body.error ?? res.statusText}\n`));
          process.exit(1);
        }

        const cloudRules = (await res.json()) as Rule[];
        const outPath = cloudRulesPath();

        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(cloudRules, null, 2));

        console.log(chalk.green(`  Pulled ${cloudRules.length} rule${cloudRules.length === 1 ? "" : "s"} from cloud.\n`));

        for (const rule of cloudRules) {
          const status = rule.enabled ? chalk.green("enabled") : chalk.dim("disabled");
          console.log(`  ${status}  ${rule.name}`);
        }

        console.log(chalk.dim(`\n  Saved to ${path.relative(process.cwd(), outPath)}\n`));
      } catch (err) {
        console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : "Failed to fetch rules"}\n`));
        process.exit(1);
      }
    });

  rules
    .command("push")
    .description("Push local rules to cloud")
    .option("--force", "Overwrite cloud rules even if they are newer")
    .action(async (opts: { force?: boolean }) => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }

      const localRules = loadLocalRules().filter((r) => r.team_id !== "local");

      if (localRules.length === 0) {
        console.log(chalk.yellow("\n  No non-default local rules to push.\n"));
        return;
      }

      console.log(chalk.dim("\n  Syncing local rules to cloud...\n"));

      try {
        // Fetch current cloud rules for comparison
        const cloudRes = await apiRequest("GET", "/api/rules");
        const cloudRules = cloudRes.ok ? ((await cloudRes.json()) as Rule[]) : [];
        const cloudById = new Map(cloudRules.map((r) => [r.id, r]));

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const rule of localRules) {
          const existing = cloudById.get(rule.id);

          if (existing) {
            // Skip if cloud version is newer (unless --force)
            if (
              !opts.force &&
              new Date(existing.updated_at) > new Date(rule.updated_at)
            ) {
              console.log(chalk.dim(`  skipped  ${rule.name} (cloud is newer)`));
              skipped++;
              continue;
            }

            const { id, user_id, team_id, created_at, updated_at, ...body } = rule;
            const res = await apiRequest("PATCH", `/api/rules/${rule.id}`, body);
            if (!res.ok) {
              const body2 = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
              console.error(chalk.red(`  failed   ${rule.name}: ${body2.error}`));
              continue;
            }
            console.log(chalk.blue(`  updated  ${rule.name}`));
            updated++;
          } else {
            const { id, user_id, team_id, created_at, updated_at, ...body } = rule;
            const res = await apiRequest("POST", "/api/rules", body);
            if (!res.ok) {
              const body2 = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
              console.error(chalk.red(`  failed   ${rule.name}: ${body2.error}`));
              continue;
            }
            console.log(chalk.green(`  created  ${rule.name}`));
            created++;
          }
        }

        console.log(
          chalk.dim(`\n  Summary: ${created} created, ${updated} updated, ${skipped} skipped\n`),
        );
      } catch (err) {
        console.error(chalk.red(`  Error: ${err instanceof Error ? err.message : "Failed to push rules"}\n`));
        process.exit(1);
      }
    });
}
