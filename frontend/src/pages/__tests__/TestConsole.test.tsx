import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppStoreProvider } from '@/context/AppStore';
import { ToastProvider } from '@/context/ToastContext';
import { TestConsolePage } from '../TestConsolePage';

describe('Test Console (demo engine)', () => {
  it('runs the whole suite against the demo engine and every case passes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppStoreProvider>
            <TestConsolePage />
          </AppStoreProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Run all/ }));
    await waitFor(() => expect(screen.getByText('9 passed')).toBeInTheDocument(), { timeout: 15000 });
    expect(screen.getByText('0 failed')).toBeInTheDocument();
  }, 20000);
});
