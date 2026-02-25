import type { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "../config";

const HOOK_SCRIPT = `#!/bin/sh
# Grepture pre-commit hook
# Installed by: grepture hook install

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Create a temp file with staged file list
TMPFILE=$(mktemp)
echo "$STAGED_FILES" > "$TMPFILE"

# Run grepture scan on each staged file
ERRORS=0
while IFS= read -r file; do
  if [ -f "$file" ]; then
    grepture scan "$file" --format text --severity {{SEVERITY}} 2>&1
    if [ $? -ne 0 ]; then
      ERRORS=1
    fi
  fi
done < "$TMPFILE"

rm -f "$TMPFILE"

if [ $ERRORS -ne 0 ]; then
  echo ""
  echo "\\033[31m  Commit blocked by Grepture — fix issues above or use --no-verify to skip\\033[0m"
  echo ""
  exit 1
fi

exit 0
`;

function findGitDir(): string | null {
  let dir = process.cwd();
  while (true) {
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      return gitDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function registerHookCommand(program: Command) {
  const hook = program
    .command("hook")
    .description("Manage git pre-commit hooks");

  hook
    .command("install")
    .description("Install git pre-commit hook")
    .action(async () => {
      const gitDir = findGitDir();
      if (!gitDir) {
        console.error(chalk.red("\n  Error: Not a git repository.\n"));
        process.exit(1);
      }

      const config = loadConfig();
      const severity = config?.hook?.block_on ?? "error";
      const hooksDir = path.join(gitDir, "hooks");
      fs.mkdirSync(hooksDir, { recursive: true });

      const hookPath = path.join(hooksDir, "pre-commit");

      // Check for existing hook
      if (fs.existsSync(hookPath)) {
        const existing = fs.readFileSync(hookPath, "utf-8");
        if (existing.includes("grepture")) {
          console.log(chalk.yellow("\n  Grepture hook already installed.\n"));
          return;
        }
        // Backup existing hook
        const backupPath = hookPath + ".backup";
        fs.copyFileSync(hookPath, backupPath);
        console.log(chalk.dim(`  Backed up existing hook to ${path.basename(backupPath)}`));
      }

      const script = HOOK_SCRIPT.replace("{{SEVERITY}}", severity);
      fs.writeFileSync(hookPath, script, { mode: 0o755 });

      console.log(chalk.green("\n  Pre-commit hook installed."));
      console.log(chalk.dim(`  Blocks on: ${severity} or above`));
      console.log(chalk.dim(`  Configure in .grepture.yml → hook.block_on\n`));
    });

  hook
    .command("uninstall")
    .description("Remove git pre-commit hook")
    .action(async () => {
      const gitDir = findGitDir();
      if (!gitDir) {
        console.error(chalk.red("\n  Error: Not a git repository.\n"));
        process.exit(1);
      }

      const hookPath = path.join(gitDir, "hooks", "pre-commit");
      if (!fs.existsSync(hookPath)) {
        console.log(chalk.yellow("\n  No pre-commit hook found.\n"));
        return;
      }

      const content = fs.readFileSync(hookPath, "utf-8");
      if (!content.includes("grepture")) {
        console.log(chalk.yellow("\n  Pre-commit hook exists but was not installed by Grepture.\n"));
        return;
      }

      fs.unlinkSync(hookPath);

      // Restore backup if exists
      const backupPath = hookPath + ".backup";
      if (fs.existsSync(backupPath)) {
        fs.renameSync(backupPath, hookPath);
        console.log(chalk.dim("  Restored previous hook from backup."));
      }

      console.log(chalk.green("\n  Pre-commit hook removed.\n"));
    });
}
