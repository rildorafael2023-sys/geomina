import { describe, expect, it } from "vitest";

import { grandeCirculo, polo, projetarLinha } from "./estereograma";

const perto = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("rede de igual área (hemisfério inferior)", () => {
  it("linha vertical fica no centro e horizontal na borda", () => {
    const c = projetarLinha(0, 90);
    perto(c.x, 0);
    perto(c.y, 0);
    const b = projetarLinha(90, 0);
    perto(b.x, 1);
    perto(b.y, 0);
  });
  it("caimento de 30° para o norte: r = √2·sen(30°)", () => {
    const p = projetarLinha(0, 30);
    perto(p.x, 0);
    perto(p.y, Math.SQRT2 * Math.sin((30 * Math.PI) / 180));
  });
  it("polo de S1 230/30 aponta para 050 com caimento 60", () => {
    const p = polo(230, 30);
    const esperado = projetarLinha(50, 60);
    perto(p.x, esperado.x);
    perto(p.y, esperado.y);
  });
  it("fratura vertical 160/90: polo na borda (rumo 340) e grande círculo é um diâmetro", () => {
    const p = polo(160, 90);
    perto(Math.hypot(p.x, p.y), 1);
    for (const q of grandeCirculo(160, 90)) {
      // pontos do diâmetro na direção 070–250: perpendicular ao polo
      perto(q.x * p.x + q.y * p.y, 0);
    }
  });
  it("grande círculo começa e termina na borda, na direção do plano", () => {
    const g = grandeCirculo(180, 45);
    perto(Math.hypot(g[0].x, g[0].y), 1);
    perto(Math.hypot(g[g.length - 1].x, g[g.length - 1].y), 1);
    // ponto central = linha de máximo mergulho (180/45)
    const meio = g[Math.floor(g.length / 2)];
    const esperado = projetarLinha(180, 45);
    perto(meio.x, esperado.x);
    perto(meio.y, esperado.y);
  });
});
