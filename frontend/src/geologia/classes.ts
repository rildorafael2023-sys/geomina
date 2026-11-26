/** Classificação de teores para colorir faixas e mapas (Seção 27 §3.2): o usuário escolhe o método e vê a legenda. */

export type Metodo = "quantis" | "iguais" | "manual";

export const PALETAS: Record<string, { nome: string; cores: string[] }> = {
  teor: { nome: "Azul → vermelho", cores: ["#2c7bb6", "#00a6ca", "#90eb9d", "#f9d057", "#f29e2e", "#d7191c", "#8b0000"] },
  verde: { nome: "Claro → verde escuro", cores: ["#f7fcb9", "#d9f0a3", "#addd8e", "#78c679", "#41ab5d", "#238443", "#005a32"] },
  cinza: { nome: "Tons de cinza (impressão)", cores: ["#f0f0f0", "#d9d9d9", "#bdbdbd", "#969696", "#737373", "#525252", "#252525"] },
};

/** Limites internos entre classes (n classes → até n−1 limites, crescentes e sem repetição). */
export function limites(valores: number[], metodo: Metodo, n: number, manuais: number[] = []): number[] {
  if (metodo === "manual") return [...new Set(manuais.filter((v) => Number.isFinite(v)))].sort((a, b) => a - b);
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2 || n < 2) return [];
  const out: number[] = [];
  if (metodo === "iguais") {
    const [a, b] = [v[0], v[v.length - 1]];
    for (let i = 1; i < n; i++) out.push(a + ((b - a) * i) / n);
  } else {
    for (let i = 1; i < n; i++) {
      const p = (i / n) * (v.length - 1), lo = Math.floor(p), hi = Math.ceil(p);
      out.push(v[lo] + (v[hi] - v[lo]) * (p - lo));
    }
  }
  return [...new Set(out.map((x) => Number(x.toPrecision(4))))].filter((x) => x > v[0] && x <= v[v.length - 1]);
}

/** Índice da classe do valor: classe k = (limite[k−1], limite[k]]; a primeira inclui tudo até o primeiro limite. */
export function classe(valor: number, lim: number[]): number {
  let k = 0;
  while (k < lim.length && valor > lim[k]) k++;
  return k;
}

/** Cores das classes espalhadas pela paleta (3 classes usam o começo, o meio e o fim). */
export function coresClasses(nClasses: number, paleta = "teor"): string[] {
  const c = PALETAS[paleta]?.cores ?? PALETAS.teor.cores;
  if (nClasses <= 1) return [c[Math.floor(c.length / 2)]];
  return Array.from({ length: nClasses }, (_, i) => c[Math.round((i * (c.length - 1)) / (nClasses - 1))]);
}

const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumSignificantDigits: 4 });

/** Rótulos da legenda: "≤ 500", "500 – 1.000", "> 1.000". */
export function rotulos(lim: number[]): string[] {
  if (!lim.length) return ["todos"];
  return [`≤ ${fmt(lim[0])}`, ...lim.slice(1).map((l, i) => `${fmt(lim[i])} – ${fmt(l)}`), `> ${fmt(lim[lim.length - 1])}`];
}

/** Texto preto ou branco conforme o fundo, para o valor ficar legível dentro da célula. */
export function textoSobre(cor: string): string {
  const h = cor.replace("#", "");
  if (h.length !== 6) return "#000";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
}
