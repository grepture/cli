import type { Command } from "commander";
import chalk from "chalk";
import { isAuthenticated, loadCredentials, CLOUD_URL } from "../config";

function parseSince(since: string): string {
  const match = since.match(/^(\d+)\s*(m|h|d)$/);
  if (!match) return new Date(Date.now() - 3600_000).toISOString(); // default 1h
  const [, n, unit] = match;
  const ms = { m: 60_000, h: 3600_000, d: 86400_000 }[unit!]!;
  return new Date(Date.now() - parseInt(n!) * ms).toISOString();
}

export function registerLogsCommand(program: Command) {
  program
    .command("logs")
    .description("View recent traffic logs (requires authentication)")
    .option("--search <term>", "Search logs by URL or body content")
    .option("--method <method>", "Filter by HTTP method (GET, POST, etc.)")
    .option("--status <status>", "Filter by status group (2xx, 4xx, 5xx)")
    .option("--since <duration>", "Show logs since duration (1h, 30m, 1d)", "1h")
    .option("-n, --limit <count>", "Number of log entries", "20")
    .action(async (options: {
      search?: string;
      method?: string;
      status?: string;
      since: string;
      limit: string;
    }) => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }

      const creds = loadCredentials()!;

      try {
        const url = new URL("/api/traffic-logs", CLOUD_URL);
        url.searchParams.set("limit", options.limit);
        url.searchParams.set("from", parseSince(options.since));
        if (options.search) url.searchParams.set("search", options.search);
        if (options.method) url.searchParams.set("method", options.method);
        if (options.status) url.searchParams.set("status", options.status);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${creds.token}` },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
          console.error(chalk.red(`\n  Error: ${body.error ?? response.statusText}\n`));
          process.exit(1);
        }

        const result = (await response.json()) as {
          data: LogEntry[];
          total: number;
          rule_names: Record<string, string>;
        };

        if (result.data.length === 0) {
          console.log(chalk.dim("\n  No logs found for the given time range.\n"));
          return;
        }

        console.log(chalk.dim(`\n  Showing ${result.data.length} of ${result.total} logs\n`));
        for (const entry of result.data) {
          printLogEntry(entry, result.rule_names);
        }
        console.log("");
      } catch (err) {
        console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : "Could not fetch logs"}\n`));
        process.exit(1);
      }
    });
}

type LogEntry = {
  id: string;
  created_at: string;
  method: string;
  target_url: string;
  status_code: number;
  rules_applied: string[] | null;
  duration_ms: number;
};

function printLogEntry(entry: LogEntry, ruleNames: Record<string, string>) {
  const time = new Date(entry.created_at).toLocaleTimeString("en-US", { hour12: false });
  const method = chalk.bold(entry.method.padEnd(6));
  const rulesApplied = entry.rules_applied?.length ?? 0;

  let status: string;
  if (entry.status_code >= 400) {
    status = chalk.red(`${entry.status_code}`);
  } else if (rulesApplied > 0) {
    status = chalk.yellow(`${entry.status_code}`);
  } else {
    status = chalk.green(`${entry.status_code}`);
  }

  let urlPath: string;
  try {
    urlPath = new URL(entry.target_url).pathname;
  } catch {
    urlPath = entry.target_url;
  }

  const duration = chalk.dim(`${entry.duration_ms}ms`);

  console.log(`  ${chalk.dim(time)} ${method} ${status} ${urlPath}  ${duration}`);

  if (rulesApplied > 0) {
    const names = (entry.rules_applied ?? []).map((id) => ruleNames[id] ?? id);
    console.log(chalk.dim(`                  rules: ${names.join(", ")}`));
  }
}
