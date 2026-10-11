import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppStoreProvider, defaultSettings, freshState } from '@/context/AppStore';
import { ToastProvider } from '@/context/ToastContext';
import { getWorkspaceId, WORKSPACE_HEADER } from '@/lib/workspace';
import { RulesPage } from '../RulesPage';

function backend() {
  let maxAmount = 80;
  let version = 1;
  const policies = () => [
    { id: 'spending-limit', name: 'Spending limit', enabled: true, config: { max_amount: maxAmount }, version, updated_at: 'now' },
    { id: 'approved-vendors', name: 'Approved vendors', enabled: true, config: { vendors: ['AudioMart', 'Approved Audio'] }, version: 1, updated_at: 'now' },
    { id: 'allowed-actions', name: 'Allowed tool actions', enabled: true, config: { actions: ['place_order', 'view_product'] }, version: 1, updated_at: 'now' },
    { id: 'evidence-review', name: 'Review suspicious evidence', enabled: true, config: { require_review_for_suspicious: true }, version: 1, updated_at: 'now' },
  ];
  const patches: Array<{ url: string; body: unknown; workspace: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    if (init.method === 'PATCH') {
      const body = JSON.parse(String(init.body));
      patches.push({ url, body, workspace: headers[WORKSPACE_HEADER] });
      maxAmount = body.config.max_amount;
      version += 1;
      return new Response(JSON.stringify(policies()[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(policies()), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return patches;
}

afterEach(() => vi.unstubAllGlobals());

describe('Your rules', () => {
  it('saves a new spending limit to this browser’s sandbox', async () => {
    const patches = backend();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppStoreProvider initialState={freshState({ ...defaultSettings(), dataSource: 'api', apiBaseUrl: 'http://backend.test' })}>
            <RulesPage />
          </AppStoreProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('now $80.00')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Approved vendors' })).toHaveTextContent('AudioMart');
    expect(within(screen.getByRole('list', { name: 'Actions your agent may take' })).getByText('Place orders')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '$150' }));
    const saveButtons = screen.getAllByRole('button', { name: 'Save' });
    await user.click(saveButtons[0]);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].url).toBe('http://backend.test/api/v1/policies/spending-limit');
    expect(patches[0].body).toEqual({ config: { max_amount: 150 } });
    expect(patches[0].workspace).toBe(getWorkspaceId());
    expect(await screen.findByText('now $150.00')).toBeInTheDocument();
  });
});
