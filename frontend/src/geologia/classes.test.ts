import { describe, expect, it } from "vitest";

import { classe, coresClasses, limites, rotulos, textoSobre } from "./classes";

describe("classes de teor", () => {
  const v = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];

  it("quantis dividem as amostras em grupos de tamanho parecido", () => {
    const l = limites(v, "quantis", 4);
    expect(l).toEqual([350, 600, 850]);
    const n = [0, 0, 0, 0];
    v.forEach((x) => n[classe(x, l)]++);
    expect(n).toEqual([3, 3, 2, 3]);
  });

  it("intervalos iguais dividem a faixa de valores", () => {
    expect(limites([0, 100], "iguais", 4)).toEqual([25, 50, 75]);
  });

  it("limites informados pelo usuário são ordenados e sem repetição", () => {
    expect(limites(v, "manual", 0, [1000, 500, 500])).toEqual([500, 1000]);
    expect(classe(500, [500, 1000])).toBe(0);
    expect(classe(501, [500, 1000])).toBe(1);
    expect(classe(5000, [500, 1000])).toBe(2);
  });

  it("poucos valores ou valores iguais não inventam classes", () => {
    expect(limites([5], "quantis", 5)).toEqual([]);
    expect(limites([7, 7, 7, 7], "quantis", 4)).toEqual([]);
    expect(limites([1, 1, 1, 9], "quantis", 4).length).toBeLessThanOrEqual(1);
  });

  it("legenda e cores", () => {
    expect(rotulos([500, 1000])).toEqual(["≤ 500", "500 – 1.000", "> 1.000"]);
    expect(coresClasses(3)).toEqual(["#2c7bb6", "#f9d057", "#8b0000"]);
    expect(textoSobre("#f7fcb9")).toBe("#111");
    expect(textoSobre("#252525")).toBe("#fff");
  });
});
