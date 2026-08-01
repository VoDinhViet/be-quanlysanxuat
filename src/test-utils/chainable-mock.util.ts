/**
 * Mocks a single link of Drizzle's fluent query builder (`.from()`, `.where()`, `.values()`,
 * `.returning()`, `.set()`, `.groupBy()`, `.orderBy()`, `.limit()`, `.offset()`, ...).
 *
 * Drizzle's builders are chainable AND themselves awaitable (thenable) — a real call like
 * `db.select({...}).from(table).where(where)` can be awaited directly, or chained further
 * first. `chainable(result)` mirrors that: every property access returns a `jest.fn()` that,
 * when called with any arguments, returns another `chainable(result)` — so any sequence of
 * chained calls a given Drizzle statement happens to use keeps working — while `await`-ing
 * (or `.then()`-ing) the object at any point in the chain resolves to `result`.
 *
 * Usage in a service spec — prefer `chainableMock()` (below) over calling `chainable()`
 * directly from a spec file:
 * ```ts
 * const mockDb = {
 *   select: chainableMock([{ total: 1 }]),
 *   insert: chainableMock([insertedRow]),
 *   update: chainableMock(undefined),
 *   delete: chainableMock(undefined),
 *   query: {
 *     users: { findMany: jest.fn(), findFirst: jest.fn() },
 *   },
 * };
 * ```
 *
 * The Proxy trap necessarily returns `any` (there's no way to type an infinitely-chainable
 * mock statically) — `no-unsafe-return` is disabled for that one line rather than for every
 * spec file that imports this.
 */
export function chainable<T>(result: T): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void) => resolve(result);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return jest.fn(() => chainable(result));
      },
    },
  );
}

/**
 * `jest.fn(() => chainable(result))`, wrapped so spec files get a properly-typed `jest.Mock`
 * back instead of needing to reason about `chainable()`'s inherent `any`. Use this in a
 * `mockDb` object (`select: chainableMock([{ total: 0 }])`) or to swap a mock mid-test
 * (`mockDb.select = chainableMock([{ total: 1 }])`).
 */
export function chainableMock<T>(result: T): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return jest.fn(() => chainable(result));
}

/**
 * Loose shape of the options object Drizzle's relational `findMany`/`findFirst` accept — cast
 * `mock.calls[0][0]` to this in a spec instead of leaving it (and everything read off it)
 * typed `any`:
 * ```ts
 * const callArgs = mockDb.query.users.findMany.mock.calls[0][0] as QueryMockArgs;
 * expect(callArgs.limit).toBe(10);
 * ```
 */
export type QueryMockArgs = {
  where?: unknown;
  limit?: number;
  offset?: number;
  orderBy?: unknown;
  with?: unknown;
  columns?: unknown;
  extras?: unknown;
};
