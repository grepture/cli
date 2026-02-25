import * as path from "path";
import type { ScanResult, Finding, Severity } from "../types";

type SarifLevel = "error" | "warning" | "note";

function toSarifLevel(severity: Severity): SarifLevel {
  if (severity === "info") return "note";
  return severity;
}

function buildRules(findings: Finding[]): Map<string, { id: string; name: string; description: string }> {
  const rules = new Map<string, { id: string; name: string; description: string }>();
  for (const f of findings) {
    if (!rules.has(f.ruleId)) {
      rules.set(f.ruleId, {
        id: f.ruleId,
        name: f.ruleId,
        description: f.message,
      });
    }
  }
  return rules;
}

export function formatSarif(result: ScanResult, cwd: string): string {
  const allFindings = result.files.flatMap((f) => f.findings);
  const rules = buildRules(allFindings);
  const ruleIndex = new Map<string, number>();
  const ruleArray = [...rules.values()];
  ruleArray.forEach((r, i) => ruleIndex.set(r.id, i));

  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "grepture",
            version: "0.1.0",
            informationUri: "https://grepture.com",
            rules: ruleArray.map((r) => ({
              id: r.id,
              name: r.name,
              shortDescription: { text: r.description },
              defaultConfiguration: { level: "warning" },
            })),
          },
        },
        results: allFindings.map((f) => ({
          ruleId: f.ruleId,
          ruleIndex: ruleIndex.get(f.ruleId),
          level: toSarifLevel(f.severity),
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: path.relative(cwd, f.file),
                  uriBaseId: "%SRCROOT%",
                },
                region: {
                  startLine: f.line,
                  startColumn: f.column,
                  endLine: f.endLine,
                  endColumn: f.endColumn,
                },
              },
            },
          ],
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
