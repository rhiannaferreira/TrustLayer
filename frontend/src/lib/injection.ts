import type { EvidenceFlag, EvidenceItem, FlagSeverity } from '@/types';

/**
 * Demonstration heuristics for instruction-like content inside untrusted evidence.
 *
 * These patterns are intentionally simple and deterministic so the demo is explainable.
 * They are NOT a comprehensive prompt-injection detector.
 */
export interface InjectionPattern {
  id: string;
  label: string;
  severity: FlagSeverity;
  pattern: RegExp;
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    id: 'override-instructions',
    label: 'Attempts to override instructions or limits',
    severity: 'HIGH',
    pattern:
      /\b(ignore|disregard|forget|bypass|override)\b[^.!?\n]{0,40}?\b(instructions?|rules?|polic(?:y|ies)|limits?|budget|guidelines|constraints|prompt)\b/gi,
  },
  {
    id: 'coercive-command',
    label: 'Imperative command aimed at the agent',
    severity: 'HIGH',
    pattern: /\byou (?:must|should|need to|are required to)\s+(?:immediately\s+)?(?:purchase|buy|order|approve|pay|transfer|checkout|click)\b[^.!?\n]*/gi,
  },
  {
    id: 'concealment',
    label: 'Asks the agent to hide information from the user',
    severity: 'HIGH',
    pattern: /\b(?:do not|don't|never)\s+(?:disclose|reveal|tell|mention|inform|show)\b[^.!?\n]*/gi,
  },
  {
    id: 'addressed-to-ai',
    label: 'Content addressed to AI systems',
    severity: 'MEDIUM',
    pattern: /\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:all\s+)?(?:ai|llm|assistants?|agents?|language models?|shopping assistants?|ai shopping assistants?)\b/gi,
  },
  {
    id: 'role-hijack',
    label: 'Role or system prompt manipulation',
    severity: 'MEDIUM',
    pattern: /\b(?:system prompt|developer mode|jailbreak|you are now|act as (?:an?|the) (?:admin|administrator|system))\b/gi,
  },
  {
    id: 'urgency-purchase',
    label: 'Urgent purchase pressure',
    severity: 'LOW',
    pattern: /\b(?:buy|purchase|order)\s+(?:this|it|now)\s+(?:immediately|right now|now|today)\b/gi,
  },
];

/** Scan one evidence item; returns non-overlapping flags with character offsets. */
export function scanEvidence(item: EvidenceItem): EvidenceFlag[] {
  const flags: EvidenceFlag[] = [];
  const taken: Array<[number, number]> = [];
  for (const def of INJECTION_PATTERNS) {
    const re = new RegExp(def.pattern.source, def.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(item.content)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (match[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const overlaps = taken.some(([s, e]) => start < e && end > s);
      if (overlaps) continue;
      taken.push([start, end]);
      flags.push({
        evidence_id: item.id,
        type: def.id,
        severity: def.severity,
        description: def.label,
        matched_text: match[0],
        start,
        end,
      });
    }
  }
  return flags.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/** Split text into plain and flagged segments for safe highlighting (no HTML injection). */
export interface TextSegment {
  text: string;
  flag?: EvidenceFlag;
}

export function segmentText(content: string, flags: EvidenceFlag[]): TextSegment[] {
  const located = flags
    .map((f) => {
      if (f.start !== undefined && f.end !== undefined && content.slice(f.start, f.end) === f.matched_text) {
        return { ...f, start: f.start, end: f.end };
      }
      if (f.matched_text) {
        const idx = content.indexOf(f.matched_text);
        if (idx >= 0) return { ...f, start: idx, end: idx + f.matched_text.length };
      }
      return null;
    })
    .filter((f): f is EvidenceFlag & { start: number; end: number } => f !== null)
    .sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const f of located) {
    if (f.start < cursor) continue;
    if (f.start > cursor) segments.push({ text: content.slice(cursor, f.start) });
    segments.push({ text: content.slice(f.start, f.end), flag: f });
    cursor = f.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  return segments;
}
