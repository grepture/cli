#!/usr/bin/env bun
import { program } from "commander";
import { registerScanCommand } from "../src/commands/scan";
import { registerInitCommand } from "../src/commands/init";
import { registerHookCommand } from "../src/commands/hook";
import { registerCiCommand } from "../src/commands/ci";
import { registerRulesCommand } from "../src/commands/rules";
import { registerLoginCommand } from "../src/commands/login";
import { registerStatusCommand } from "../src/commands/status";
import { registerLogsCommand } from "../src/commands/logs";
import { registerDevCommand } from "../src/commands/dev";

program
  .name("grepture")
  .description("AI security scanner for developers. Scan for PII, secrets, prompt injection, and unsafe AI SDK usage.")
  .version("0.1.0");

registerScanCommand(program);
registerInitCommand(program);
registerHookCommand(program);
registerCiCommand(program);
registerRulesCommand(program);
registerLoginCommand(program);
registerStatusCommand(program);
registerLogsCommand(program);
registerDevCommand(program);

program.parse();
