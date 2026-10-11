export type Strictness = "lenient" | "standard" | "strict";

export interface EvaluateRequest {
  query: string;
  response: string;
  rules?: string;
  strictness: Strictness;
}

export interface Check {
  id: string;
  requirement: string;
  category: "coverage" | "constraint" | "consistency" | "business_rule";
  status: "pass" | "partial" | "fail";
  severity: "minor" | "major";
  evidence_quote: string;
  explanation: string;
  fix: string;
}

export interface VerificationItem {
  claim: string;
  reason: string;
}

export interface EvaluateResult {
  verdict: "pass" | "needs_revision" | "fail";
  score: number;
  summary: string;
  checks: Check[];
  verification_needed: VerificationItem[];
}

export interface RepairRequest {
  query: string;
  response: string;
  rules?: string;
  failed_checks: Check[];
}

export interface RepairResult {
  repaired_response: string;
  changes: string[];
}
