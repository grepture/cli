import type { Command } from "commander";
import chalk from "chalk";
import { isAuthenticated, loadCredentials } from "../config";

const CLOUD_API = "https://proxy.grepture.com";

export function registerLogsCommand(program: Command) {
  program
    .command("logs")
    .description("View recent traffic logs (requires authentication)")
    .option("--live", "Real-time tail of traffic logs via SSE")
    .option("--filter <filter>", "Filter logs (pii, blocked, model:gpt-4o)")
    .option("--since <duration>", "Show logs since duration (1h, 30m, 1d)", "1h")
    .option("-n, --limit <count>", "Number of log entries", "20")
    .action(async (options: {
      live?: boolean;
      filter?: string;
      since: string;
      limit: string;
    }) => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }

      const creds = loadCredentials()!;

      if (options.live) {
        console.log(chalk.dim("\n  Connecting to live log stream...\n"));

        try {
          const url = new URL("/v1/logs/stream", CLOUD_API);
          if (options.filter) url.searchParams.set("filter", options.filter);

          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${creds.token}`,
              Accept: "text/event-stream",
            },
          });

          if (!response.ok) {
            console.error(chalk.red(`  Error: ${response.status} ${response.statusText}\n`));
            process.exit(1);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            console.error(chalk.red("  Error: No response body\n"));
            process.exit(1);
          }

          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            // Parse SSE events
            for (const line of text.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const entry = JSON.parse(line.slice(6));
                  printLogEntry(entry);
                } catch {
                  // skip malformed events
                }
              }
            }
          }
        } catch (err) {
          console.error(chalk.red(`  Error: Could not connect to log stream\n`));
          process.exit(1);
        }

        return;
      }

      // Fetch recent logs
      try {
        const url = new URL("/v1/logs", CLOUD_API);
        url.searchParams.set("since", options.since);
        url.searchParams.set("limit", options.limit);
        if (options.filter) url.searchParams.set("filter", options.filter);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${creds.token}` },
        });

        if (!response.ok) {
          console.error(chalk.red(`\n  Error: ${response.status} ${response.statusText}\n`));
          process.exit(1);
        }

        const data = await response.json() as { logs: LogEntry[] };
        const logs = data.logs ?? [];

        if (logs.length === 0) {
          console.log(chalk.dim("\n  No logs found for the given time range.\n"));
          return;
        }

        console.log("");
        for (const entry of logs) {
          printLogEntry(entry);
        }
        console.log("");
      } catch (err) {
        console.error(chalk.red(`\n  Error: Could not fetch logs\n`));
        process.exit(1);
      }
    });
}

type LogEntry = {
  created_at?: string;
  method: string;
  target_url: string;
  status_code: number;
  rules_applied: string[];
  duration_ms: number;
  provider?: string;
};

function printLogEntry(entry: LogEntry) {
  const time = entry.created_at
    ? new Date(entry.created_at).toLocaleTimeString("en-US", { hour12: false })
    : "--:--:--";

  const method = chalk.bold(entry.method);
  const provider = entry.provider ? chalk.dim(` → ${entry.provider}`) : "";

  let status: string;
  const rulesApplied = entry.rules_applied?.length ?? 0;
  if (entry.status_code >= 400) {
    status = chalk.red(`[BLOCKED]`);
  } else if (rulesApplied > 0) {
    status = chalk.yellow(`[${rulesApplied} rule${rulesApplied !== 1 ? "s" : ""} applied]`);
  } else {
    status = chalk.green("[clean]");
  }

  const urlPath = new URL(entry.target_url).pathname;
  console.log(`  ${chalk.dim(time)} ${method} ${urlPath}${provider}  ${status}`);
}
