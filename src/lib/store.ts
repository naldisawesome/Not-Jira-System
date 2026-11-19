"use client";
import { useSyncExternalStore } from "react";

/** Minimal global UI store (mobile nav, command palette) without extra dependencies. */
export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (v: T | ((p: T) => T)) => {
      state = typeof v === "function" ? (v as (p: T) => T)(state) : v;
      subs.forEach((s) => s());
    },
    useValue: () =>
      useSyncExternalStore(
        (cb) => {
          subs.add(cb);
          return () => subs.delete(cb);
        },
        () => state,
        () => initial,
      ),
  };
}

export const mobileNav = createStore(false);
export const commandPalette = createStore(false);
