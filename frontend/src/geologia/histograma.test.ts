import { describe, expect, it } from "vitest";

import { bordas, contar } from "./histograma";

describe("histograma", () => {
  it("bordas lineares e contagem incluindo o máximo", () => {
    const b = bordas([0, 10], 5);
    expect(b).toEqual([0, 2, 4, 6, 8, 10]);
    expect(contar([0, 1, 2, 9.9, 10, 11, -1], b)).toEqual([2, 1, 0, 0, 2]);
  });
  it("bordas em log ignoram zeros e negativos", () => {
    const b = bordas([1, 10, 100, 0, -5], 2, true);
    expect(b.map((x) => Math.round(x))).toEqual([1, 10, 100]);
    expect(contar([1, 5, 10, 50, 100], b)).toEqual([2, 3]);
  });
  it("Sturges e casos vazios", () => {
    expect(bordas(Array.from({ length: 64 }, (_, i) => i)).length).toBe(8); // ceil(log2 64 + 1) = 7 classes
    expect(bordas([])).toEqual([]);
    expect(bordas([5, 5])).toEqual([5, 6]);
  });
});
