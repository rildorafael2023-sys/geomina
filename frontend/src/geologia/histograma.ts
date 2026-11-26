/** Classes de histograma comuns a vários grupos (mesmas bordas para comparar). */
export function bordas(valores: number[], n?: number, log = false): number[] {
  const v = valores.filter((x) => Number.isFinite(x) && (!log || x > 0));
  if (!v.length) return [];
  const f = log ? Math.log10 : (x: number) => x;
  const a = Math.min(...v.map(f)), b = Math.max(...v.map(f));
  const k = n ?? Math.max(5, Math.min(30, Math.ceil(Math.log2(v.length) + 1))); // Sturges, entre 5 e 30
  if (b === a) return [a, a + 1].map((x) => (log ? 10 ** x : x));
  return Array.from({ length: k + 1 }, (_, i) => a + ((b - a) * i) / k).map((x) => (log ? 10 ** x : x));
}

/** Contagem por classe: [b0,b1), [b1,b2) … a última inclui o máximo. */
export function contar(valores: number[], b: number[]): number[] {
  const c = new Array(Math.max(0, b.length - 1)).fill(0);
  for (const x of valores) {
    if (!Number.isFinite(x) || x < b[0] || x > b[b.length - 1]) continue;
    let i = b.findIndex((_, k) => k < b.length - 1 && x >= b[k] && x < b[k + 1]);
    if (i < 0) i = c.length - 1;
    c[i]++;
  }
  return c;
}
