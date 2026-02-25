import type { Command } from "commander";
import chalk from "chalk";
import { execFile } from "child_process";
import { saveCredentials, clearCredentials, CLOUD_URL } from "../config";

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  execFile(cmd, [url]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Authenticate with Grepture Cloud")
    .option("--token <token>", "API token (alternative to browser login)")
    .action(async (options: { token?: string }) => {
      if (options.token) {
        saveCredentials({ token: options.token });
        console.log(chalk.green("\n  Authenticated with API token.\n"));
        return;
      }

      console.log(chalk.bold("\n  Grepture Cloud Login\n"));

      // Request a device code
      let deviceCode: string;
      let userCode: string;
      let verificationUrl: string;

      try {
        const res = await fetch(`${CLOUD_URL}/api/auth/device-codes`, {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          device_code: string;
          user_code: string;
          verification_url: string;
        };
        deviceCode = data.device_code;
        userCode = data.user_code;
        verificationUrl = data.verification_url;
      } catch {
        console.error(
          chalk.red("  Failed to connect to Grepture Cloud.\n"),
        );
        console.log(
          chalk.dim(
            "  You can authenticate manually with:\n    grepture login --token <your-token>\n",
          ),
        );
        process.exit(1);
      }

      console.log(`  Enter this code: ${chalk.bold.cyan(userCode)}\n`);

      // Open browser
      openBrowser(verificationUrl);
      console.log(
        chalk.dim(`  Opening ${verificationUrl} in your browser...\n`),
      );

      // Poll for approval
      const maxAttempts = 180; // 15 minutes at 5s intervals
      const pollInterval = 5000;

      for (let i = 0; i < maxAttempts; i++) {
        await sleep(pollInterval);

        try {
          const res = await fetch(
            `${CLOUD_URL}/api/auth/device-codes/token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ device_code: deviceCode }),
            },
          );

          const data = (await res.json()) as {
            status: string;
            token?: string;
            email?: string;
            team_id?: string;
          };

          if (data.status === "approved") {
            saveCredentials({
              token: data.token!,
              email: data.email ?? undefined,
              team_id: data.team_id ?? undefined,
            });

            console.log(
              chalk.green(
                `  Authenticated as ${chalk.bold(data.email ?? "unknown")}.\n`,
              ),
            );
            return;
          }

          if (data.status === "expired") {
            console.error(chalk.red("\n  Code expired.\n"));
            console.log(
              chalk.dim(
                "  Run `grepture login` to try again, or use:\n    grepture login --token <your-token>\n",
              ),
            );
            process.exit(1);
          }

          // status === "pending" — keep polling
          if (i === 0) {
            process.stdout.write(chalk.dim("  Waiting for authorization"));
          } else {
            process.stdout.write(chalk.dim("."));
          }
        } catch {
          // Network error — keep trying
        }
      }

      // Timed out
      console.error(chalk.red("\n\n  Timed out waiting for authorization.\n"));
      console.log(
        chalk.dim(
          "  Run `grepture login` to try again, or use:\n    grepture login --token <your-token>\n",
        ),
      );
      process.exit(1);
    });

  program
    .command("logout")
    .description("Remove stored credentials")
    .action(async () => {
      clearCredentials();
      console.log(chalk.green("\n  Logged out.\n"));
    });
}
