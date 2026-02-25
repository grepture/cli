import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { discoverFiles, scanFiles, filterBySeverity } from "../src/scanner";

const tmpDir = path.join(import.meta.dir, "tmp_scanner_test");

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "clean.ts"),
    'const x = 1;\nconst y = "hello";\n',
  );
  fs.writeFileSync(
    path.join(tmpDir, "dirty.ts"),
    'const email = "test@example.com";\nconst ssn = "123-45-6789";\n',
  );
  fs.writeFileSync(
    path.join(tmpDir, "info_only.ts"),
    'const ip = "10.0.0.1";\n',
  );
  fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "node_modules", "dep.ts"),
    'const ssn = "999-99-9999";\n',
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("File Discovery", () => {
  test("discovers files in directory", async () => {
    const files = await discoverFiles(tmpDir);
    expect(files.length).toBe(3); // clean.ts, dirty.ts, info_only.ts
  });

  test("excludes node_modules by default", async () => {
    const files = await discoverFiles(tmpDir);
    const hasNodeModules = files.some((f) => f.includes("node_modules"));
    expect(hasNodeModules).toBe(false);
  });

  test("discovers single file", async () => {
    const files = await discoverFiles(path.join(tmpDir, "dirty.ts"));
    expect(files.length).toBe(1);
    expect(files[0]).toEndWith("dirty.ts");
  });
});

describe("Scanning", () => {
  test("finds issues in dirty files", async () => {
    const result = await scanFiles([path.join(tmpDir, "dirty.ts")]);
    expect(result.totalFindings).toBe(2);
    expect(result.bySeverity.error).toBe(1); // SSN
    expect(result.bySeverity.warning).toBe(1); // email
  });

  test("reports no issues for clean files", async () => {
    const result = await scanFiles([path.join(tmpDir, "clean.ts")]);
    expect(result.totalFindings).toBe(0);
  });

  test("counts by category", async () => {
    const result = await scanFiles([path.join(tmpDir, "dirty.ts")]);
    expect(result.byCategory["email"]).toBe(1);
    expect(result.byCategory["ssn"]).toBe(1);
  });
});

describe("Severity Filtering", () => {
  test("filters by error severity", async () => {
    const result = await scanFiles([path.join(tmpDir, "dirty.ts")]);
    const filtered = filterBySeverity(result, "error");
    expect(filtered.totalFindings).toBe(1); // Only SSN
    expect(filtered.files[0].findings[0].category).toBe("ssn");
  });

  test("filters by warning severity", async () => {
    const result = await scanFiles([path.join(tmpDir, "dirty.ts"), path.join(tmpDir, "info_only.ts")]);
    const filtered = filterBySeverity(result, "warning");
    // SSN (error) + email (warning) — IP (info) excluded
    expect(filtered.totalFindings).toBe(2);
  });

  test("includes all with info severity", async () => {
    const result = await scanFiles([path.join(tmpDir, "dirty.ts"), path.join(tmpDir, "info_only.ts")]);
    const filtered = filterBySeverity(result, "info");
    expect(filtered.totalFindings).toBe(3);
  });
});
