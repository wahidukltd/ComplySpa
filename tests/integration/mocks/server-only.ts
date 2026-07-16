// Vitest mock for the "server-only" package.
// In the test environment (jsdom), server-only throws when imported.
// This mock makes it a no-op so integration tests can import admin.ts.
export {};
