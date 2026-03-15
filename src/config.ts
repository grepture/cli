import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import type { GrepturConfig, Credentials } from "./types";

export const CLOUD_URL = process.env.GREPTURE_CLOUD_URL ?? "https://app.grepture.com";
export const PROXY_URL = process.env.GREPTURE_PROXY_URL ?? "https://proxy.grepture.com";

const CONFIG_FILENAME = ".grepture.yml";
const CREDENTIALS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".grepture",
);
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials");

export function findConfigFile(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  while (true) {
    const configPath = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(configPath)) return configPath;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadConfig(startDir?: string): GrepturConfig {
  const configPath = findConfigFile(startDir);
  if (!configPath) return {};
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return YAML.parse(content) ?? {};
  } catch {
    return {};
  }
}

export function writeConfig(dir: string, config: GrepturConfig): string {
  const configPath = path.join(dir, CONFIG_FILENAME);
  fs.writeFileSync(configPath, YAML.stringify(config));
  return configPath;
}

export function loadCredentials(): Credentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    const content = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(CREDENTIALS_FILE);
  } catch {
    // ignore
  }
}

export function isAuthenticated(): boolean {
  const creds = loadCredentials();
  if (!creds?.token) return false;
  if (creds.expires_at && new Date(creds.expires_at) < new Date()) return false;
  return true;
}
