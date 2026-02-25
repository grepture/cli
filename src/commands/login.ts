import type { Command } from "commander";
import chalk from "chalk";
import { saveCredentials, clearCredentials, isAuthenticated, loadCredentials } from "../config";

const CLOUD_URL = "https://app.grepture.com";

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
      console.log(`  Visit: ${chalk.cyan(`${CLOUD_URL}/settings/tokens`)}`);
      console.log(`  Create an API token and run:\n`);
      console.log(chalk.dim("    grepture login --token <your-token>\n"));
    });

  program
    .command("logout")
    .description("Remove stored credentials")
    .action(async () => {
      clearCredentials();
      console.log(chalk.green("\n  Logged out.\n"));
    });
}
