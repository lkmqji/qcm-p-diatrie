// Lightweight DOM & Web Storage mock for Node.js unit tests (node --test)
export function createMemoryStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    }
  };
}

export function installMockBrowserEnv() {
  if (!globalThis.localStorage) {
    globalThis.localStorage = createMemoryStorage();
  }
  if (!globalThis.window) {
    globalThis.window = globalThis;
  }
  return globalThis.localStorage;
}
