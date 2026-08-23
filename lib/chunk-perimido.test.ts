import { describe, it, expect } from "vitest";
import { esChunkPerimido } from "@/lib/chunk-perimido";

describe("esChunkPerimido", () => {
  it("reconoce los errores típicos de chunk viejo tras un deploy", () => {
    expect(esChunkPerimido({ name: "ChunkLoadError", message: "Loading chunk 9571 failed" })).toBe(true);
    expect(esChunkPerimido({ message: "Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js" })).toBe(true);
    expect(esChunkPerimido({ message: "'text/html' is not a valid JavaScript MIME type" })).toBe(true);
  });
  it("no confunde un error normal", () => {
    expect(esChunkPerimido({ name: "TypeError", message: "x is not a function" })).toBe(false);
    expect(esChunkPerimido({})).toBe(false);
  });
});
