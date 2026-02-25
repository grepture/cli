import * as fs from "fs";
import type { ScanResult, Finding } from "../types";

const placeholders: Record<string, string> = {
  email: "[EMAIL_REDACTED]",
  phone: "[PHONE_REDACTED]",
  ssn: "[SSN_REDACTED]",
  credit_card: "[CREDIT_CARD_REDACTED]",
  ip_address: "[IP_REDACTED]",
  address: "[ADDRESS_REDACTED]",
  date_of_birth: "[DOB_REDACTED]",
  aws_key: "[AWS_KEY_REDACTED]",
  github_token: "[GITHUB_TOKEN_REDACTED]",
  generic_api_key: "[API_KEY_REDACTED]",
  private_key: "[PRIVATE_KEY_REDACTED]",
  connection_string: "[CONNECTION_STRING_REDACTED]",
  env_secret: "[SECRET_REDACTED]",
};

const fixableCategories = new Set(Object.keys(placeholders));

export function applyFixes(result: ScanResult): number {
  let fixCount = 0;

  for (const fileResult of result.files) {
    const fixable = fileResult.findings.filter((f) => fixableCategories.has(f.category));
    if (fixable.length === 0) continue;

    let content = fs.readFileSync(fileResult.file, "utf-8");

    // Sort by position descending so we can replace right-to-left
    const sorted = [...fixable].sort((a, b) => {
      const aOffset = getOffset(content, a.line, a.column);
      const bOffset = getOffset(content, b.line, b.column);
      return bOffset - aOffset;
    });

    for (const finding of sorted) {
      const offset = getOffset(content, finding.line, finding.column);
      const replacement = placeholders[finding.category] ?? "[REDACTED]";
      content =
        content.slice(0, offset) +
        replacement +
        content.slice(offset + finding.match.length);
      fixCount++;
    }

    fs.writeFileSync(fileResult.file, content);
  }

  return fixCount;
}

function getOffset(text: string, line: number, column: number): number {
  let offset = 0;
  let currentLine = 1;
  while (currentLine < line && offset < text.length) {
    if (text[offset] === "\n") currentLine++;
    offset++;
  }
  return offset + column - 1;
}
