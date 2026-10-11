import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppStoreProvider, freshState } from '@/context/AppStore';
import { ToastProvider } from '@/context/ToastContext';
import { PlaygroundPage } from '../PlaygroundPage';
import { SHOES_UNDER_50, LAPTOPS_UNDER_50_NO_MATCH } from '@/test/agentRunFixtures';

function renderLive() {
  const state = freshState({ dataSource: 'api', apiBaseUrl: 'http://backend.test', useAi: false, autoExecute: false });
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AppStoreProvider initialState={state}>
          <PlaygroundPage />
        </AppStoreProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function routeFetch(body: unknown) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    if (url.endsWith('/api/v1/agent/run')) return new Response(JSON.stringify(body), { status: 200 });
    return new Response(JSON.stringify({ detail: 'not used in this test' }), { status: 404 });
  }));
  return urls;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Agent Playground · Live AI agent', () => {
  it('shows shoe recommendations for a shoe request, never headphones', async () => {
    const user = userEvent.setup();
    const urls = routeFetch(SHOES_UNDER_50);
    renderLive();
    const goal = screen.getByLabelText(/Task for the agent/);
    await user.clear(goal);
    await user.type(goal, 'Find shoes under $50');
    await user.click(screen.getByRole('button', { name: /Run agent/ }));

    const panel = (await screen.findByText('Product recommendations')).closest('section') as HTMLElement;
    expect(urls.some((u) => u.endsWith('/api/v1/agent/run'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/api/v1/agent/propose'))).toBe(false);
    expect(within(panel).getByRole('article', { name: /Recommended: Trailrunner Lite Running Shoes/ })).toBeInTheDocument();
    expect(within(panel).getByText(/Demo catalog · fictional products/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Headphones/i)).toBeNull();
    expect(within(panel).getAllByText(/Fictional demo product/).length).toBeGreaterThan(0);
  }, 20000);

  it('shows NO_MATCH instead of a product from another category', async () => {
    const user = userEvent.setup();
    routeFetch(LAPTOPS_UNDER_50_NO_MATCH);
    renderLive();
    const goal = screen.getByLabelText(/Task for the agent/);
    await user.clear(goal);
    await user.type(goal, 'Find laptops under $50');
    await user.click(screen.getByRole('button', { name: /Run agent/ }));
    expect(await screen.findAllByText('No matching products')).not.toHaveLength(0);
    expect(screen.queryByRole('article', { name: /Recommended/ })).toBeNull();
  }, 20000);
});
