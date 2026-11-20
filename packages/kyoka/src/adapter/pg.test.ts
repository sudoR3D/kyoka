import { describe, expect, test } from "bun:test";
import { pgAdapter } from "./pg.js";

describe("pgAdapter pool detection", () => {
  test("accepts a pool-like object from another pg copy", () => {
    const pool = {
      query: async () => ({ rows: [] }),
      connect: async () => {
        throw new Error("not used");
      },
    };
    expect(() => pgAdapter(pool as never)).not.toThrow();
  });
});
