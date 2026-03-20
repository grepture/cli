import type { Command } from "commander";
import chalk from "chalk";
import { isAuthenticated, loadCredentials, CLOUD_URL, PROXY_URL } from "../config";

type LogEntry = {
  id: string;
  created_at: string;
  method: string;
  target_url: string;
  status_code: number;
  rules_applied: string[] | null;
  duration_ms: number;
  model?: string | null;
  total_tokens?: number | null;
};

function printLogEntry(entry: LogEntry) {
  const time = new Date(entry.created_at).toLocaleTimeString("en-US", { hour12: false });
  const method = chalk.bold(entry.method.padEnd(6));

  let status: string;
  if (entry.status_code >= 400) {
    status = chalk.red(`${entry.status_code}`);
  } else if (entry.rules_applied && entry.rules_applied.length > 0) {
    status = chalk.yellow(`${entry.status_code}`);
  } else {
    status = chalk.green(`${entry.status_code}`);
  }

  const model = (entry.model ?? "—").padEnd(12);
  const duration = `${entry.duration_ms}ms`.padStart(6);

  const tokens = entry.total_tokens
    ? `${entry.total_tokens.toLocaleString()} tok`.padStart(10)
    : "".padStart(10);

  let urlPath: string;
  try {
    urlPath = new URL(entry.target_url).pathname;
  } catch {
    urlPath = entry.target_url;
  }

  const blocked = entry.status_code === 403 && entry.rules_applied && entry.rules_applied.length > 0;
  const tokDisplay = blocked ? chalk.red("BLOCKED".padStart(10)) : chalk.dim(tokens);

  console.log(
    `  ${chalk.dim(time)}  ${method} ${status}  ${chalk.dim(model)}  ${chalk.dim(duration)}  ${tokDisplay}  ${urlPath}`,
  );
}

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

export function registerDevCommand(program: Command) {
  program
    .command("dev")
    .description("Start a local dev session with live proxy and observability")
    .option("--port <port>", "Local proxy port", "8787")
    .option("--target <url>", "Default upstream AI provider base URL", "https://api.openai.com")
    .option("--name <name>", "Optional session label")
    .action(async (options: { port: string; target: string; name?: string }) => {
      if (!isAuthenticated()) {
        console.error(chalk.red("\n  Error: Authentication required. Run `grepture login` first.\n"));
        process.exit(1);
      }

      const creds = loadCredentials()!;
      const port = parseInt(options.port);
      const targetBase = options.target.replace(/\/$/, "");

      // Fetch API key from settings
      let apiKey: string;
      try {
        const settingsRes = await fetch(`${CLOUD_URL}/api/settings`, {
          headers: { Authorization: `Bearer ${creds.token}` },
        });
        if (!settingsRes.ok) {
          console.error(chalk.red("\n  Error: Could not fetch API settings. Make sure you have an API key configured.\n"));
          process.exit(1);
        }
        const settings = (await settingsRes.json()) as { api_key?: string };
        if (!settings.api_key) {
          console.error(chalk.red("\n  Error: No API key found. Configure one at https://app.grepture.com/api\n"));
          process.exit(1);
        }
        apiKey = settings.api_key;
      } catch (err) {
        console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : "Could not connect to Grepture"}\n`));
        process.exit(1);
      }

      // Create session
      let sessionId: string;
      let expiresAt: string;
      try {
        const sessionRes = await fetch(`${CLOUD_URL}/api/sessions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: options.name || null,
            metadata: { port, hostname: (await import("os")).hostname(), cli_version: (await import("../../package.json")).default.version },
          }),
        });
        if (!sessionRes.ok) {
          const body = await sessionRes.json().catch(() => ({ error: sessionRes.statusText })) as { error?: string };
          console.error(chalk.red(`\n  Error creating session: ${body.error ?? sessionRes.statusText}\n`));
          process.exit(1);
        }
        const session = (await sessionRes.json()) as { id: string; status: string; created_at: string; expires_at: string };
        sessionId = session.id;
        expiresAt = session.expires_at;
      } catch (err) {
        console.error(chalk.red(`\n  Error: ${err instanceof Error ? err.message : "Could not create session"}\n`));
        process.exit(1);
      }

      // Activity tracking for idle/disconnect timeouts
      const IDLE_TIMEOUT_MS = 5 * 60 * 1000;       // 5 min → idle
      const DISCONNECT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min → disconnect
      let lastActivityAt = Date.now();
      let sessionStatus: "active" | "idle" = "active";

      function trackActivity() {
        lastActivityAt = Date.now();
        if (sessionStatus === "idle") {
          sessionStatus = "active";
          patchSessionStatus("active");
          console.log(chalk.dim("  Session resumed.\n"));
        }
      }

      function patchSessionStatus(status: string) {
        fetch(`${CLOUD_URL}/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }).catch(() => {});
      }

      // Local proxy handler
      async function handler(req: Request): Promise<Response> {
        if (req.method === "OPTIONS") {
          return new Response(null, { headers: corsHeaders });
        }

        trackActivity();
        const url = new URL(req.url);
        const originalAuth = req.headers.get("authorization") || "";
        const bodyBytes = await req.arrayBuffer();

        // Determine target
        let targetUrl = req.headers.get("x-grepture-target");
        if (!targetUrl) {
          targetUrl = `${targetBase}${url.pathname}${url.search}`;
        }

        // Build clean headers for cloud proxy (don't forward host, connection, etc.)
        const headers = new Headers();
        headers.set("authorization", `Bearer ${apiKey}`);
        headers.set("x-grepture-target", targetUrl);
        headers.set("x-grepture-session-id", sessionId);
        if (originalAuth) {
          headers.set("x-grepture-auth-forward", originalAuth);
        }

        // Forward content-type and other safe headers from the original request
        const forwardHeaders = ["content-type", "accept", "user-agent"];
        for (const h of forwardHeaders) {
          const v = req.headers.get(h);
          if (v) headers.set(h, v);
        }

        try {
          const proxyUrl = `${PROXY_URL}${url.pathname}`;
          const response = await fetch(proxyUrl, {
            method: req.method,
            headers,
            body: bodyBytes.byteLength > 0 ? bodyBytes : undefined,
          });

          const responseHeaders = new Headers(response.headers);
          responseHeaders.set("access-control-allow-origin", "*");

          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: "Cloud proxy unreachable" }), {
            status: 502,
            headers: { "content-type": "application/json", ...corsHeaders },
          });
        }
      }

      // Start local server
      let server: ReturnType<typeof Bun.serve>;
      try {
        server = Bun.serve({ port, fetch: handler });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("EADDRINUSE")) {
          console.error(chalk.red(`\n  Error: Port ${port} is already in use. Try --port ${port + 1}\n`));
        } else {
          console.error(chalk.red(`\n  Error starting server: ${err instanceof Error ? err.message : String(err)}\n`));
        }
        // Clean up session
        await fetch(`${CLOUD_URL}/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "disconnected" }),
        }).catch(() => {});
        process.exit(1);
      }

      // Print session header
      console.log("");
      console.log(chalk.bold("  Grepture Dev Session"));
      console.log(chalk.dim("  ─────────────────────────────────────────"));
      console.log(`  ${chalk.dim("Session:")}    ${sessionId}`);
      console.log(`  ${chalk.dim("Proxy:")}      http://localhost:${port}`);
      console.log(`  ${chalk.dim("Target:")}     ${targetBase}`);
      console.log(`  ${chalk.dim("Dashboard:")}  ${CLOUD_URL}/sessions/${sessionId}`);
      console.log(`  ${chalk.dim("Expires:")}    ${new Date(expiresAt).toLocaleString()}`);
      console.log(chalk.dim("  ─────────────────────────────────────────"));
      console.log(chalk.dim("  Waiting for requests...\n"));

      // Polling loop for live tail + idle/disconnect checks
      let cursor: string | null = null;
      let polling = true;

      const pollInterval = setInterval(async () => {
        if (!polling) return;

        // Check idle/disconnect timeouts
        const idleMs = Date.now() - lastActivityAt;
        if (idleMs >= DISCONNECT_TIMEOUT_MS) {
          console.log(chalk.yellow("\n  No traffic for 15 minutes. Disconnecting session.\n"));
          polling = false;
          cleanup();
          return;
        }
        if (idleMs >= IDLE_TIMEOUT_MS && sessionStatus === "active") {
          sessionStatus = "idle";
          patchSessionStatus("idle");
          console.log(chalk.dim("  Session idle (no traffic for 5 min). Will disconnect after 15 min.\n"));
        }

        try {
          const url = new URL(`/api/sessions/${sessionId}/logs`, CLOUD_URL);
          if (cursor) url.searchParams.set("after", cursor);
          url.searchParams.set("limit", "50");

          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${creds.token}` },
          });

          if (!res.ok) {
            if (res.status === 404) {
              console.log(chalk.yellow("\n  Session expired or not found. Exiting.\n"));
              polling = false;
              cleanup();
            }
            return;
          }

          const result = (await res.json()) as { data: LogEntry[]; cursor: string | null };
          if (result.data.length > 0) trackActivity();
          for (const entry of result.data) {
            printLogEntry(entry);
          }
          if (result.cursor) cursor = result.cursor;
        } catch {
          // Network error, skip this poll
        }
      }, 2000);

      // Graceful shutdown
      async function cleanup() {
        polling = false;
        clearInterval(pollInterval);
        server.stop();

        try {
          await fetch(`${CLOUD_URL}/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "disconnected" }),
          });
        } catch {
          // Best effort
        }

        console.log(chalk.dim("\n  Session disconnected. Goodbye.\n"));
        process.exit(0);
      }

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    });
}
