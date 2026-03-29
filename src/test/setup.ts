// Global test setup for Vitest
import { beforeEach, afterEach, vi } from "vitest";
import { resetFactoryCounter } from "./factories";
import { store } from "@/lib/store";

beforeEach(() => {
  resetFactoryCounter();
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});
