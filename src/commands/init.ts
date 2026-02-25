import type { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { findConfigFile, writeConfig } from "../config";
import type { GrepturConfig } from "../types";
import { defaultRules } from "../rules/defaults";

const DEFAULT_CONFIG: GrepturConfig = {
  scan: {
    severity: "warning",
    paths: {
      include: ["**/*"],
      exclude: ["node_modules", "dist", "build", "*.test.*", "*.spec.*"],
    },
  },
  hook: {
    block_on: "error",
  },
  rules: {
    cloud: true,
    local: ".grepture/rules/",
  },
};

export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description("Initialize .grepture.yml in project")
    .option("--force", "Overwrite existing config")
    .action(async (options: { force?: boolean }) => {
      const cwd = process.cwd();
      const existing = findConfigFile(cwd);

      if (existing && !options.force) {
        console.log(chalk.yellow(`\n  Config already exists: ${path.relative(cwd, existing)}`));
        console.log(chalk.dim("  Use --force to overwrite.\n"));
        return;
      }

      // Write config
      const configPath = writeConfig(cwd, DEFAULT_CONFIG);
      console.log(chalk.green(`\n  Created ${path.relative(cwd, configPath)}`));

      // Create .grepture directory
      const grepturDir = path.join(cwd, ".grepture", "rules");
      fs.mkdirSync(grepturDir, { recursive: true });
      console.log(chalk.green(`  Created .grepture/rules/`));

      // Write default rules
      const rulesPath = path.join(grepturDir, "default.json");
      fs.writeFileSync(rulesPath, JSON.stringify(defaultRules, null, 2));
      console.log(chalk.green(`  Created .grepture/rules/default.json`));

      // Create .greptureignore
      const ignorePath = path.join(cwd, ".greptureignore");
      if (!fs.existsSync(ignorePath)) {
        fs.writeFileSync(
          ignorePath,
          [
            "# Grepture ignore file",
            "# Patterns here will be excluded from scanning",
            "",
            "node_modules/",
            "dist/",
            "build/",
            ".next/",
            "coverage/",
            "*.min.js",
            "*.min.css",
            "",
          ].join("\n"),
        );
        console.log(chalk.green(`  Created .greptureignore`));
      }

      console.log("");
      console.log(chalk.dim("  Next steps:"));
      console.log(chalk.dim("    grepture scan          Scan your project"));
      console.log(chalk.dim("    grepture hook install   Install git pre-commit hook"));
      console.log(chalk.dim("    grepture login          Connect to Grepture Cloud"));
      console.log("");
    });
}
