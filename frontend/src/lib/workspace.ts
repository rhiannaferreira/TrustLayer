import { STORAGE_KEYS } from '@/lib/config';

/**
 * Each browser gets a private sandbox on the backend: its own rules, decisions and history.
 * The id travels with every live request in this header; the backend never shares data across ids.
 */
export const WORKSPACE_HEADER = 'X-TrustLayer-Workspace';

const VALID = /^[A-Za-z0-9_-]{8,64}$/;
let current: string | null = null;

function generate(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `ws-${random}`;
}

export function getWorkspaceId(): string {
  if (current) return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.workspace);
    if (stored && VALID.test(stored)) return (current = stored);
  } catch {
    /* storage blocked: fall through and keep a sandbox for this tab only */
  }
  return newWorkspaceId();
}

/** Start a fresh, empty sandbox. The old one stays on the backend until it is cleared. */
export function newWorkspaceId(): string {
  current = generate();
  try {
    localStorage.setItem(STORAGE_KEYS.workspace, current);
  } catch {
    /* storage blocked: the new id lasts for this tab */
  }
  return current;
}
