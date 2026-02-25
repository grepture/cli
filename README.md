# Grepture CLI

An AI security scanner for developers.

Scan your codebase for PII leaks, hardcoded secrets, prompt injection vulnerabilities, and unsafe AI SDK usage patterns. Works locally (free, offline) with optional cloud-powered scanning for advanced detection.

## Install

```sh
bun install -g @grepture/cli
```

## Quick Start

```sh
# Initialize config in your project
grepture init

# Scan your project
grepture scan

# Scan a specific file
grepture scan src/api/chat.ts

# Install git pre-commit hook
grepture hook install
```

## What It Detects

### PII (Personally Identifiable Information)
- Email addresses
- Phone numbers (US + international)
- Social Security Numbers
- Credit card numbers (Visa, Mastercard, Amex, Discover)
- IP addresses
- Physical addresses
- Dates of birth

### Secrets & API Keys
- AWS access keys
- GitHub tokens (PAT, fine-grained)
- OpenAI / Anthropic API keys
- Stripe keys
- Slack tokens
- Generic API keys and bearer tokens
- Private keys (RSA, EC, DSA, OpenSSH)
- Database connection strings (Postgres, MySQL, MongoDB, Redis)
- Environment variable secrets

### AI Security
- Prompt injection patterns in template files
- Unsafe AI SDK usage (string concatenation in prompts, `eval()` on responses, hardcoded API keys, unsanitized filesystem writes)

## Commands

### `grepture scan [path]`

Scan files for AI security risks.

```sh
grepture scan                          # Scan current directory
grepture scan src/                     # Scan specific directory
grepture scan --severity error         # Only show errors
grepture scan --format json            # JSON output
grepture scan --format sarif           # SARIF output (for GitHub Code Scanning)
grepture scan --fix                    # Auto-fix: redact PII and secrets in-place
```

Example output:

```
  src/api/chat.ts:12:21 error [grepture/generic-api-key]
  E API key or secret detected
    12 | const key = "sk-proj-abc123...";
       |              ~~~~~~~~~~~~~~~~~~

  src/prompts/system.txt:5:1 warning [grepture/prompt-injection]
  W Potential prompt injection pattern detected
     5 | Ignore all previous instructions
       | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  2 findings (1 error, 1 warning)
```

Exit code `1` if any errors are found.

### `grepture init`

Initialize Grepture in your project. Creates:
- `.grepture.yml` — scan configuration
- `.grepture/rules/default.json` — bundled detection rules
- `.greptureignore` — files to exclude from scanning

### `grepture hook install` / `grepture hook uninstall`

Install a git pre-commit hook that scans staged files before each commit. Blocks the commit if findings meet the configured severity threshold.

```sh
grepture hook install      # Install pre-commit hook
grepture hook uninstall    # Remove pre-commit hook
```

Configure the blocking threshold in `.grepture.yml`:

```yaml
hook:
  block_on: error    # error, warning, or info
```

### `grepture ci`

CI-optimized scanning. Scans only changed files (PR diff) by default, with SARIF output for GitHub Code Scanning.

```sh
grepture ci                        # SARIF output, PR diff only
grepture ci --all                  # Scan all files
grepture ci --format json          # JSON output
grepture ci --base develop         # Compare against develop branch
```

Exit code `1` if any findings at or above the severity threshold.

### `grepture rules list`

Show all active rules — built-in detection patterns and any local/cloud rules.

### `grepture rules test <file>`

Test your rules against a specific file to see what gets flagged.

### `grepture status`

Show current configuration, authentication state, and available features.

### `grepture login` / `grepture logout`

Authenticate with Grepture Cloud for advanced features (AI-powered NER, ML-based detection, team rules sync, live traffic logs).

```sh
grepture login --token <your-token>
```

## Configuration

### `.grepture.yml`

```yaml
scan:
  severity: warning              # Minimum severity to report: error, warning, info
  paths:
    include: ["**/*"]
    exclude: ["node_modules", "dist", "*.test.*"]

hook:
  block_on: error                # Severity that blocks commits

rules:
  cloud: true                    # Enable cloud rules (requires auth)
  local: ".grepture/rules/"      # Path to local rule files
```

### `.greptureignore`

Gitignore-style file for excluding paths from scanning:

```
node_modules/
dist/
build/
*.min.js
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Grepture Security Scan

on:
  pull_request:
  push:
    branches: [main]

permissions:
  security-events: write
  contents: read

jobs:
  grepture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install -g @grepture/cli
      - run: grepture ci --format sarif > results.sarif
        continue-on-error: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
          category: grepture
```

## Output Formats

| Format | Flag | Use Case |
|--------|------|----------|
| Text | `--format text` (default) | Terminal output with source context |
| JSON | `--format json` | Custom pipelines, scripting |
| SARIF | `--format sarif` | GitHub Code Scanning, GitLab SAST |

## Free vs Cloud

| Feature | Free (local) | Pro (cloud) |
|---------|-------------|-------------|
| Regex PII scanning | Yes | Yes |
| Secret detection | Yes | Yes |
| Prompt injection patterns | Yes | Yes |
| Unsafe AI usage detection | Yes | Yes |
| Git hooks & CI | Yes | Yes |
| Local rules | Yes | Yes |
| AI-powered NER | — | Yes |
| ML security analysis | — | Yes |
| Team rules sync | — | Yes |
| Live traffic logs | — | Yes |

The CLI is fully functional offline and free. Cloud features require a [Grepture](https://grepture.com) account.

## Development

```sh
# Install dependencies
bun install

# Run the CLI locally
bun bin/grepture.ts scan .

# Run tests
bun test

# Type check
bun run typecheck

# Build standalone binary
bun run build
```

## License

[AGPL-3.0](LICENSE)
