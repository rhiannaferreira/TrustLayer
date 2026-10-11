
import '@testing-library/jest-dom/vitest';

// Provide browser-like storage when Node doesn't expose it correctly.
function createTestStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(String(key)) ?? null;
    },
    setItem(key: string, value: string) {
      items.set(String(key), String(value));
    },
    removeItem(key: string) {
      items.delete(String(key));
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
  };
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = globalThis[name];

  if (!storage || typeof storage.clear !== 'function') {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: createTestStorage(),
    });
  }
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as unknown as {
  ResizeObserver: typeof ResizeObserverStub;
}).ResizeObserver = ResizeObserverStub;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
