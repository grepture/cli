import type { PiiCategory, SecretCategory } from "../types";

// PII patterns (ported from proxy/src/pii/patterns.ts)
export const piiPatterns: Record<PiiCategory, RegExp[]> = {
  email: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],

  phone: [
    /(\+1)?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /\+\d{1,3}[\s.-]?\d{4,14}/g,
  ],

  ssn: [/\b\d{3}-\d{2}-\d{4}\b/g],

  credit_card: [
    /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    /\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/g,
    /\b6(?:011|5\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ],

  ip_address: [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g],

  address: [
    /\b\d{1,5}\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir)\b/gi,
  ],

  name: [],

  date_of_birth: [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{2,4}\b/gi,
  ],
};

// Secret detection patterns
export const secretPatterns: Record<SecretCategory, RegExp[]> = {
  aws_key: [
    // AWS Access Key ID
    /\bAKIA[0-9A-Z]{16}\b/g,
    // AWS Secret Access Key (40 char base64)
    /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/g,
  ],

  github_token: [
    // GitHub personal access tokens (classic and fine-grained)
    /\bghp_[A-Za-z0-9]{36}\b/g,
    /\bgho_[A-Za-z0-9]{36}\b/g,
    /\bghu_[A-Za-z0-9]{36}\b/g,
    /\bghs_[A-Za-z0-9]{36}\b/g,
    /\bghr_[A-Za-z0-9]{36}\b/g,
    /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/g,
  ],

  generic_api_key: [
    // OpenAI API key
    /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g,
    // OpenAI project key
    /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g,
    // Anthropic API key
    /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g,
    // Generic "api_key = ..." patterns
    /(?:api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[=:]\s*['"]([A-Za-z0-9_\-/.+=]{20,})['"]?/gi,
    // Bearer token in strings
    /['"]Bearer\s+[A-Za-z0-9_\-/.+=]{20,}['"]/g,
    // Slack tokens
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    // Stripe keys
    /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
  ],

  private_key: [
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  ],

  connection_string: [
    // Database connection strings
    /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s'"]+/gi,
    // JDBC connection strings
    /jdbc:[a-z]+:\/\/[^\s'"]+/gi,
  ],

  env_secret: [
    // .env style secrets with common secret key names
    /(?:SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|DB_PASS|DATABASE_URL|AUTH_SECRET|JWT_SECRET|SESSION_SECRET|ENCRYPTION_KEY)\s*=\s*['"]?[^\s'"]{8,}['"]?/g,
  ],
};

// Prompt injection patterns (for template/prompt files)
export const promptInjectionPatterns: RegExp[] = [
  // Common prompt injection attempts
  /ignore (?:all )?(?:previous|prior|above) (?:instructions|prompts?|context)/gi,
  /disregard (?:all )?(?:previous|prior|above) (?:instructions|prompts?)/gi,
  /you are now (?:a |an )?(?:different|new) (?:AI|assistant|bot|model)/gi,
  /forget (?:all )?(?:previous|prior|your) (?:instructions|rules|constraints)/gi,
  /(?:system|admin|root) prompt(?:\s*:|override)/gi,
  /\bDAN\b.*\bjailbreak\b/gi,
  /do anything now/gi,
  /bypass (?:your |all )?(?:safety|security|content) (?:filters?|restrictions?|guidelines?)/gi,
  /act as (?:if )?(?:you have )?no (?:restrictions|rules|guidelines|limits)/gi,
];

// Unsafe AI SDK usage patterns
export const unsafeAiUsagePatterns: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\.(?:chat|complete|generate)\([^)]*\buser\b[^)]*\+[^)]*\)/g,
    message: "String concatenation in AI API call — use parameterized messages to prevent injection",
  },
  {
    pattern: /(?:openai|anthropic|ai)\.[^(]+\(\s*\{[^}]*(?:prompt|messages)\s*:\s*`/g,
    message: "Template literal in AI API call — user input in templates may enable prompt injection",
  },
  {
    pattern: /(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|AI_API_KEY)\s*(?:=|:)\s*['"][^'"]+['"]/g,
    message: "Hardcoded AI API key — use environment variables instead",
  },
  {
    pattern: /eval\s*\([^)]*(?:response|completion|output|result)\b/g,
    message: "eval() on AI response — never execute AI-generated code without sandboxing",
  },
  {
    pattern: /(?:fs|require\(['"]fs['"]\))\.(?:write|append).*(?:response|completion|output)/g,
    message: "Writing AI response directly to filesystem — validate and sanitize first",
  },
];
