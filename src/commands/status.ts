import type { Command } from "commander";
import chalk from "chalk";
import * as path from "path";
import { findConfigFile, loadConfig, isAuthenticated, loadCredentials } from "../config";

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Show config, auth state, and sync status")
    .action(async () => {
      const cwd = process.cwd();
      console.log(chalk.bold("\n  Grepture Status\n"));

      // Config
      const configPath = findConfigFile(cwd);
      if (configPath) {
        console.log(`  Config:  ${chalk.green(path.relative(cwd, configPath))}`);
        const config = loadConfig(cwd);
        console.log(`  Severity: ${chalk.cyan(config?.scan?.severity ?? "info")}`);
        console.log(`  Hook blocks on: ${chalk.cyan(config?.hook?.block_on ?? "error")}`);
      } else {
        console.log(`  Config:  ${chalk.yellow("not found")} — run ${chalk.dim("grepture init")}`);
      }

      console.log("");

      // Auth
      if (isAuthenticated()) {
        const creds = loadCredentials();
        console.log(`  Auth:    ${chalk.green("authenticated")}`);
        if (creds?.email) {
          console.log(`  Account: ${chalk.cyan(creds.email)}`);
        }
        if (creds?.team_id) {
          console.log(`  Team:    ${chalk.cyan(creds.team_id)}`);
        }
      } else {
        console.log(`  Auth:    ${chalk.dim("not logged in")} — run ${chalk.dim("grepture login")}`);
      }

      console.log("");

      // Features
      console.log(chalk.bold("  Features\n"));
      console.log(`  ${chalk.green("+")} Local regex scanning`);
      console.log(`  ${chalk.green("+")} Git hooks & CI`);
      console.log(`  ${chalk.green("+")} Local rules`);
      if (isAuthenticated()) {
        console.log(`  ${chalk.green("+")} Cloud scanning (NER, ML)`);
        console.log(`  ${chalk.green("+")} Cloud rules sync`);
        console.log(`  ${chalk.green("+")} Live traffic logs`);
      } else {
        console.log(`  ${chalk.dim("-")} Cloud scanning — ${chalk.dim("requires Pro")}`);
        console.log(`  ${chalk.dim("-")} Cloud rules sync — ${chalk.dim("requires Pro")}`);
        console.log(`  ${chalk.dim("-")} Live traffic logs — ${chalk.dim("requires Pro")}`);
      }
      console.log("");
    });
}
