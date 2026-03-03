import "@testing-library/jest-dom";

// Suppress console.warn/error noise in test output unless explicitly tested.
// Individual tests can restore them with vi.spyOn / vi.restoreAllMocks.
vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);
