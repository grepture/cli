# Grepture CLI

A local AI gateway for development.

Route your AI traffic through Grepture during development to get observability, cost tracking, PII redaction, and prompt management — without changing your production config. Also includes a standalone security scanner for catching PII leaks, hardcoded secrets, and unsafe AI patterns in your codebase.

## Install

```sh
bun install -g @grepture/cli
```

## Quick Start

```sh
# Start a local AI gateway session
grepture dev

# Point your AI SDK at localhost
export OPENAI_BASE_URL=http://localhost:8787/proxy

# That's it — requests now flow through Grepture with full observability
```

## Commands

### `grepture dev`

Start a local AI gateway that routes traffic through Grepture Cloud. Requests from your app hit `localhost`, flow through the gateway (with your rules, PII redaction, and prompt management applied), and responses stream back. A live tail prints every request in your terminal as it happens.

```sh
grepture dev                           # Start on default port 8787
grepture dev --port 9000               # Custom port
grepture dev --target https://api.anthropic.com  # Default upstream provider
grepture dev --name "search-agent"     # Label the session
```

Point your AI SDK at `http://localhost:8787` during development to get:

- **Observability** — every request logged with model, tokens, latency, cost
- **PII redaction** — sensitive data caught before it reaches the model
- **Prompt management** — resolve managed prompts server-side
- **Rule enforcement** — your team's rules applied in real-time
- **Cost tracking** — see exactly what each request costs
- **Live traffic tail** — requests printed to your terminal as they flow

Sessions auto-disconnect after 15 minutes of inactivity. Requires authentication (`grepture login`).

### `grepture login` / `grepture logout`

Authenticate with Grepture Cloud to enable the gateway and cloud-powered scanning.

```sh
grepture login --token <your-token>
```

### `grepture scan [path]`

Scan files for PII, hardcoded secrets, and AI security risks.

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

#### What It Detects

**PII (Personally Identifiable Information)**
- Email addresses, phone numbers (US + international), Social Security Numbers
- Credit card numbers (Visa, Mastercard, Amex, Discover)
- IP addresses, physical addresses, dates of birth

**Secrets & API Keys**
- AWS access keys, GitHub tokens, OpenAI / Anthropic API keys, Stripe keys, Slack tokens
- Generic API keys and bearer tokens, private keys (RSA, EC, DSA, OpenSSH)
- Database connection strings (Postgres, MySQL, MongoDB, Redis)

**AI Security**
- Prompt injection patterns in template files
- Unsafe AI SDK usage (string concatenation in prompts, `eval()` on responses, hardcoded API keys, unsanitized filesystem writes)

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

| Feature | Free (local) | Cloud |
|---------|-------------|-------|
| Local AI gateway (`dev`) | — | Yes |
| Observability & cost tracking | — | Yes |
| Prompt management | — | Yes |
| Regex PII scanning | Yes | Yes |
| Secret detection | Yes | Yes |
| Prompt injection patterns | Yes | Yes |
| Unsafe AI usage detection | Yes | Yes |
| Git hooks & CI | Yes | Yes |
| Local rules | Yes | Yes |
| AI-powered NER | — | Yes |
| ML security analysis | — | Yes |
| Team rules sync | — | Yes |

The scanner is fully functional offline and free. The gateway and cloud features require a [Grepture](https://grepture.com) account.

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
