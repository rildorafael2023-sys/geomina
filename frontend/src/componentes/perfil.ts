/** Utilidades comuns ao perfil da frente (amostras) e ao log de sondagem. */

export interface TermoP { id: string; nome: string; cor: string | null; sigla: string | null }

const PALETA = ["#c9a36b", "#8fb573", "#e0c35a", "#9fb4cc", "#d98e73", "#b39ddb", "#80cbc4", "#f2b880", "#a1887f", "#c5e1a5", "#ef9a9a", "#90a4ae"];

/** Cor da litologia: a do dicionário; sem cor cadastrada, uma cor fixa calculada pelo nome (mesma rocha = mesma cor). */
export function corLitologia(t: { nome: string; cor: string | null } | null | undefined, texto?: string | null): string {
  if (t?.cor) return t.cor;
  const nome = t?.nome ?? texto ?? "";
  if (!nome) return "#eeeeee";
  let h = 0;
  for (const c of nome.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

export const m = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

/** Abre uma janela só com o conteúdo do elemento, para imprimir ou salvar em PDF. */
export function imprimirElemento(el: HTMLElement | null, titulo: string) {
  if (!el) return;
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;margin:16px;color:#111}
    h1{font-size:16px;margin:0 0 4px} table{border-collapse:collapse;width:100%;margin-top:8px}
    th,td{border:1px solid #999;padding:2px 4px;text-align:left;vertical-align:top} th{background:#eee}
    .nao-imprimir,button{display:none!important} svg{max-width:100%} img{max-width:240px;margin:4px}
    @page{size:A4 landscape;margin:10mm}
  </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/** Agrupa linhas consecutivas com a mesma chave (para mesclar as células de teor de uma amostra que cobre vários trechos). */
export function grupos<T>(linhas: T[], chave: (x: T) => string | null): number[] {
  const span = linhas.map(() => 0);
  let i = 0;
  while (i < linhas.length) {
    let j = i + 1;
    const k = chave(linhas[i]);
    while (k !== null && j < linhas.length && chave(linhas[j]) === k) j++;
    span[i] = j - i;
    i = j;
  }
  return span; // 0 = célula mesclada com a de cima
}

/** Teor como veio do laudo, com vírgula decimal (0.12 → 0,12; <0.5 → <0,5). */
export const teor = (t: string | undefined) => (t ?? "").replace(".", ",");
