import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppStoreProvider, useAppStore } from '@/context/AppStore';
import { ToastProvider } from '@/context/ToastContext';
import { AttackLabPage } from '../AttackLabPage';

function RecordCount() {
  const { records } = useAppStore();
  return <output data-testid="count">{records.length}</output>;
}

function renderLab() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AppStoreProvider>
          <AttackLabPage />
          <RecordCount />
        </AppStoreProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Attack Lab', () => {
  it('re-evaluates edited inputs and records every run in shared state', async () => {
    const user = userEvent.setup();
    renderLab();
    const seeded = Number(screen.getByTestId('count').textContent);

    await user.click(screen.getByRole('radio', { name: /Valid action/ }));
    await user.click(screen.getByRole('button', { name: /Run original/ }));
    expect(await screen.findByText('Action approved', {}, { timeout: 8000 })).toBeInTheDocument();
    // Approved actions are not auto-executed.
    expect(screen.queryByText(/Simulated checkout completed/)).toBeNull();

    const price = screen.getByLabelText(/Purchase amount/);
    await user.clear(price);
    await user.type(price, '129');
    await user.click(screen.getByRole('button', { name: /Run modified/ }));
    expect(await screen.findByText('Action blocked', {}, { timeout: 8000 })).toBeInTheDocument();

    const violations = screen.getAllByText('Policy violations').map((n) => n.closest('section') ?? n.parentElement!);
    expect(violations.some((v) => within(v as HTMLElement).queryAllByText(/Spending limit/).length > 0)).toBe(true);
    expect(screen.getByLabelText('What changed')).toBeInTheDocument();
    expect(Number(screen.getByTestId('count').textContent)).toBe(seeded + 2);
  }, 20000);
});
