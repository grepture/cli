import * as path from "path";
import type { ScanResult } from "../types";

export function formatJson(result: ScanResult, cwd: string): string {
  const output = {
    ...result,
    files: result.files.map((f) => ({
      ...f,
      file: path.relative(cwd, f.file),
      findings: f.findings.map((finding) => ({
        ...finding,
        file: path.relative(cwd, finding.file),
      })),
    })),
  };
  return JSON.stringify(output, null, 2);
}
