// PII categories (from proxy)
export type PiiCategory =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "ip_address"
  | "address"
  | "name"
  | "date_of_birth";

// Secret categories (from browse extension)
export type SecretCategory =
  | "aws_key"
  | "github_token"
  | "generic_api_key"
  | "private_key"
  | "connection_string"
  | "env_secret";

// All scannable categories
export type DetectionCategory = PiiCategory | SecretCategory | "prompt_injection" | "unsafe_ai_usage";

// Severity levels for findings
export type Severity = "error" | "warning" | "info";

// A single finding from a scan
export type Finding = {
  ruleId: string;
  category: DetectionCategory;
  severity: Severity;
  message: string;
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  match: string;
  fix?: string; // auto-fix replacement text
};

// Scan result for a single file
export type FileScanResult = {
  file: string;
  findings: Finding[];
};

// Overall scan result
export type ScanResult = {
  files: FileScanResult[];
  totalFindings: number;
  byCategory: Record<string, number>;
  bySeverity: Record<Severity, number>;
};

// Output format options
export type OutputFormat = "text" | "json" | "sarif";

// Config from .grepture.yml
export type GrepturConfig = {
  scan?: {
    severity?: Severity;
    paths?: {
      include?: string[];
      exclude?: string[];
    };
  };
  hook?: {
    block_on?: Severity;
  };
  rules?: {
    cloud?: boolean;
    local?: string;
  };
};

// Rule types (mirrored from proxy/src/types.ts)
export type AiPiiCategory = "person" | "location" | "organization";
export type ToxicityCategory = "toxic" | "severe_toxic" | "obscene" | "threat" | "insult" | "identity_hate";
export type DlpCategory = "source_code" | "credentials" | "internal_document" | "financial_data";
export type ComplianceDomain = "healthcare" | "financial" | "legal" | "insurance";

type ActionBase = {
  id: string;
  enabled: boolean;
};

export type RedactPiiAction = ActionBase & {
  type: "redact_pii";
  categories: PiiCategory[];
  replacement: "placeholder" | "hash" | "mask";
  mode: "redact" | "mask_and_restore";
  token_prefix: string;
  ttl_seconds: number;
};

export type FindReplaceAction = ActionBase & {
  type: "find_replace";
  find: string;
  replace: string;
  is_regex: boolean;
  case_sensitive: boolean;
};

export type TokenizeAction = ActionBase & {
  type: "tokenize";
  fields: string[];
  token_prefix: string;
  ttl_seconds: number;
};

export type RedactFieldAction = ActionBase & {
  type: "redact_field";
  fields: string[];
  replacement: string;
};

export type BlockRequestAction = ActionBase & {
  type: "block_request";
  status_code: number;
  message: string;
};

export type LogOnlyAction = ActionBase & {
  type: "log_only";
  severity: "info" | "warn" | "critical";
  label: string;
};

export type AiDetectPiiAction = ActionBase & {
  type: "ai_detect_pii";
  categories: AiPiiCategory[];
  replacement: "placeholder" | "hash" | "mask";
  mode: "redact" | "mask_and_restore";
  token_prefix: string;
  ttl_seconds: number;
};

export type AiDetectInjectionAction = ActionBase & {
  type: "ai_detect_injection";
  threshold: number;
  on_detect: "block" | "log";
  block_status_code: number;
  block_message: string;
};

export type AiDetectToxicityAction = ActionBase & {
  type: "ai_detect_toxicity";
  categories: ToxicityCategory[];
  threshold: number;
  on_detect: "block" | "log" | "redact";
  block_status_code: number;
  block_message: string;
};

export type AiDetectDlpAction = ActionBase & {
  type: "ai_detect_dlp";
  categories: DlpCategory[];
  threshold: number;
  on_detect: "block" | "log";
  block_status_code: number;
  block_message: string;
};

export type AiDetectComplianceAction = ActionBase & {
  type: "ai_detect_compliance";
  domains: ComplianceDomain[];
  threshold: number;
  on_detect: "block" | "log" | "flag";
  block_status_code: number;
  block_message: string;
};

export type RuleAction =
  | RedactPiiAction
  | FindReplaceAction
  | TokenizeAction
  | RedactFieldAction
  | BlockRequestAction
  | LogOnlyAction
  | AiDetectPiiAction
  | AiDetectInjectionAction
  | AiDetectToxicityAction
  | AiDetectDlpAction
  | AiDetectComplianceAction;

export type RuleCondition = {
  id: string;
  field: "header" | "model" | "body" | "url";
  operator: "contains" | "equals" | "matches" | "exists";
  value: string;
};

export type RuleConditionGroup = {
  id: string;
  logic: "and" | "or";
  conditions: RuleCondition[];
};

export type Rule = {
  id: string;
  user_id: string;
  team_id: string;
  name: string;
  description: string;
  enabled: boolean;
  apply_to: "input" | "output" | "both";
  sampling_rate: number;
  timeout_seconds: number;
  conditions: RuleConditionGroup[];
  match_all: boolean;
  actions: RuleAction[];
  created_at: string;
  updated_at: string;
};

// Auth credentials stored in ~/.grepture/credentials
export type Credentials = {
  token: string;
  email?: string;
  team_id?: string;
  expires_at?: string;
};
