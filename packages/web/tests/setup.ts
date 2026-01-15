/**
 * Vitest setup file for @pokeralph/web tests
 *
 * Sets up the test environment with necessary mocks and polyfills.
 */

import { beforeEach, afterEach, vi } from "vitest";

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
  get length() {
    return Object.keys(localStorageMock.store).length;
  },
  key: vi.fn((index: number) => {
    const keys = Object.keys(localStorageMock.store);
    return keys[index] ?? null;
  }),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
});

// Reset localStorage mock before each test
beforeEach(() => {
  localStorageMock.store = {};
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
