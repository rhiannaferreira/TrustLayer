import { render } from '@testing-library/react';
import { AppStoreProvider, useAppStore } from '@/context/AppStore';

type Store = ReturnType<typeof useAppStore>;

function Capture({ onStore }: { onStore: (s: Store) => void }) {
  onStore(useAppStore());
  return null;
}

describe('AppStore', () => {
  it('sees its own writes before React re-renders', () => {
    let store: Store | undefined;
    render(
      <AppStoreProvider>
        <Capture onStore={(s) => (store = s)} />
      </AppStoreProvider>,
    );
    const record = store!.records[0];
    expect(record).toBeDefined();
    expect(record.review.status).not.toBe('APPROVED');

    // No await between the write and the read, so React has no chance to re-render. The Test
    // Console and the demo gateway make calls like this back to back.
    void store!.decideReview(record.id, 'APPROVED');
    expect(store!.getRecord(record.id)?.review.status).toBe('APPROVED');
  });
});
