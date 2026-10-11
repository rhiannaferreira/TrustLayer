import { getWorkspaceId, newWorkspaceId, WORKSPACE_HEADER } from '../workspace';
import { STORAGE_KEYS } from '../config';
import { createHttpClient } from '@/services/api';

afterEach(() => vi.unstubAllGlobals());

describe('private sandbox id', () => {
  it('is stable, valid for the backend, and remembered by the browser', () => {
    const id = getWorkspaceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getWorkspaceId()).toBe(id);
    expect(localStorage.getItem(STORAGE_KEYS.workspace)).toBe(id);
  });

  it('changes when a fresh sandbox is started', () => {
    const before = getWorkspaceId();
    const after = newWorkspaceId();
    expect(after).not.toBe(before);
    expect(getWorkspaceId()).toBe(after);
  });

  it('is sent with every backend request', async () => {
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const api = createHttpClient('http://backend.test');
    await api.listEvaluations();
    await api.patchPolicy('spending-limit', { config: { max_amount: 150 } });
    expect(seen).toHaveLength(2);
    for (const headers of seen) expect(headers[WORKSPACE_HEADER]).toBe(getWorkspaceId());
  });
});
