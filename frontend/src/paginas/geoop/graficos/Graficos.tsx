/** Gráficos da comparação (SVG próprio): boxplot, histograma, dispersão e matriz de correlação. */
import { bordas, contar } from "../../../geologia/histograma";

export const CORES_GRUPO = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#c2255c", "#5c940d", "#6741d9", "#868e96", "#d6336c", "#1098ad"];
const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumSignificantDigits: 4 });

interface Est { n: number; min?: number; q1?: number; mediana?: number; q3?: number; max?: number; media?: number }
export interface SerieGrupo { nome: string; cor: string; est: Est; valores: number[] }

function eixo(lo: number, hi: number, log: boolean, px: number) {
  const f = log ? Math.log10 : (x: number) => x;
  const a = f(lo), b = f(hi === lo ? lo + 1 : hi);
  const passo = (b - a) / 4;
  const marcas = Array.from({ length: 5 }, (_, i) => (log ? 10 ** (a + passo * i) : a + passo * i));
  return { pos: (v: number) => ((f(Math.max(v, log ? lo : -Infinity)) - a) / (b - a)) * px, marcas };
}

/** Boxplot: caixa Q1–Q3, mediana, bigodes até mín/máx, média (◆) e pontos individuais (jitter determinístico). */
export function Boxplot({ titulo, unidade, series, log }: { titulo: string; unidade: string; series: SerieGrupo[]; log: boolean }) {
  const W = 120 * Math.max(1, series.length) + 60, H = 260, M = 50, T = 24, B = 40;
  const todos = series.flatMap((s) => s.valores).filter((v) => !log || v > 0);
  if (!todos.length) return <svg width={W} height={60}><text x={8} y={30} fontSize={12} fill="#868e96">{titulo}: sem valores</text></svg>;
  const lo = Math.min(...todos), hi = Math.max(...todos);
  const e = eixo(log ? lo : Math.min(0, lo), hi, log, H - T - B);
  const y = (v: number) => H - B - e.pos(v);
  const larg = (W - M - 10) / series.length;
  return (
    <svg width={W} height={H} data-testid={`boxplot-${titulo}`} style={{ fontFamily: "Inter, Arial, sans-serif" }}>
      <text x={M} y={14} fontSize={12} fontWeight={700}>{titulo} <tspan fontWeight={400} fill="#868e96">{unidade}{log ? " · log" : ""}</tspan></text>
      {e.marcas.map((m) => <g key={m}><line x1={M} x2={W - 10} y1={y(m)} y2={y(m)} stroke="#f1f3f5" /><text x={M - 4} y={y(m) + 3} fontSize={9} textAnchor="end" fill="#868e96">{fmt(m)}</text></g>)}
      {series.map((s, i) => {
        const cx = M + larg * (i + 0.5), w = Math.min(46, larg * 0.5);
        if (!s.est.n) return <text key={s.nome} x={cx} y={H - B - 10} fontSize={9} textAnchor="middle" fill="#868e96">sem dados</text>;
        const { q1 = 0, q3 = 0, mediana = 0, min = 0, max = 0, media = 0 } = s.est;
        return (
          <g key={s.nome} data-grupo={s.nome}>
            <line x1={cx} x2={cx} y1={y(min)} y2={y(q1)} stroke="#495057" /><line x1={cx} x2={cx} y1={y(q3)} y2={y(max)} stroke="#495057" />
            <line x1={cx - w / 4} x2={cx + w / 4} y1={y(min)} y2={y(min)} stroke="#495057" /><line x1={cx - w / 4} x2={cx + w / 4} y1={y(max)} y2={y(max)} stroke="#495057" />
            <rect x={cx - w / 2} y={y(q3)} width={w} height={Math.max(1, y(q1) - y(q3))} fill={s.cor} fillOpacity={0.25} stroke={s.cor} strokeWidth={1.5} />
            <line x1={cx - w / 2} x2={cx + w / 2} y1={y(mediana)} y2={y(mediana)} stroke={s.cor} strokeWidth={2.5} />
            <path d={`M${cx},${y(media) - 4} L${cx + 4},${y(media)} L${cx},${y(media) + 4} L${cx - 4},${y(media)} Z`} fill="#fff" stroke="#212529" />
            {s.valores.filter((v) => !log || v > 0).map((v, k) => <circle key={k} cx={cx + w / 2 + 6 + ((k * 37) % 11)} cy={y(v)} r={2} fill={s.cor} opacity={0.6} />)}
            <text x={cx} y={H - B + 14} fontSize={10} textAnchor="middle">{s.nome.length > 16 ? s.nome.slice(0, 15) + "…" : s.nome}</text>
            <text x={cx} y={H - B + 26} fontSize={9} textAnchor="middle" fill="#868e96">n = {s.est.n}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Histogramas com as MESMAS classes para todos os grupos (pequenos múltiplos). */
export function Histograma({ titulo, unidade, series, log }: { titulo: string; unidade: string; series: SerieGrupo[]; log: boolean }) {
  const todos = series.flatMap((s) => s.valores);
  const b = bordas(todos, undefined, log);
  if (b.length < 2) return <svg width={300} height={40}><text x={8} y={24} fontSize={12} fill="#868e96">{titulo}: sem valores</text></svg>;
  const contagens = series.map((s) => contar(s.valores, b));
  const maxC = Math.max(1, ...contagens.flat());
  const W = 320, Hs = 90, M = 34;
  return (
    <svg width={W} height={20 + series.length * (Hs + 18) + 18} data-testid={`histograma-${titulo}`} style={{ fontFamily: "Inter, Arial, sans-serif" }}>
      <text x={4} y={14} fontSize={12} fontWeight={700}>{titulo} <tspan fontWeight={400} fill="#868e96">{unidade}{log ? " · classes log" : ""}</tspan></text>
      {series.map((s, i) => {
        const y0 = 22 + i * (Hs + 18), bw = (W - M - 8) / contagens[i].length;
        return (
          <g key={s.nome}>
            <text x={M} y={y0 + 8} fontSize={10} fill={s.cor} fontWeight={700}>{s.nome} (n = {s.valores.length})</text>
            {contagens[i].map((c, k) => <rect key={k} x={M + k * bw} y={y0 + Hs - (c / maxC) * (Hs - 12)} width={Math.max(1, bw - 1)} height={(c / maxC) * (Hs - 12)} fill={s.cor} opacity={0.75}><title>{`${fmt(b[k])}–${fmt(b[k + 1])}: ${c}`}</title></rect>)}
            <line x1={M} x2={W - 8} y1={y0 + Hs} y2={y0 + Hs} stroke="#adb5bd" />
            <text x={M - 4} y={y0 + 16} fontSize={8} textAnchor="end" fill="#868e96">{maxC}</text>
          </g>
        );
      })}
      <text x={M} y={20 + series.length * (Hs + 18) + 12} fontSize={9} fill="#868e96">{fmt(b[0])}</text>
      <text x={W - 8} y={20 + series.length * (Hs + 18) + 12} fontSize={9} textAnchor="end" fill="#868e96">{fmt(b[b.length - 1])}</text>
    </svg>
  );
}

/** Dispersão entre dois analitos, pontos coloridos por grupo; só amostras com os dois valores. */
export function Dispersao({ ax, ay, ux, uy, pontos, log, r }: {
  ax: string; ay: string; ux: string; uy: string; pontos: { x: number; y: number; cor: string; grupo: string; codigo: string }[]; log: boolean;
  r: { grupo: string; cor: string; n: number; pearson: number | null; spearman: number | null }[];
}) {
  const W = 460, H = 380, M = 54, T = 16, B = 40;
  const vx = pontos.map((p) => p.x).filter((v) => !log || v > 0), vy = pontos.map((p) => p.y).filter((v) => !log || v > 0);
  if (!vx.length) return <svg width={W} height={60}><text x={8} y={30} fontSize={12} fill="#868e96">Sem amostras com {ax} e {ay}.</text></svg>;
  const ex = eixo(Math.min(...vx), Math.max(...vx), log, W - M - 12), ey = eixo(Math.min(...vy), Math.max(...vy), log, H - T - B);
  return (
    <svg width={W} height={H + 20 * r.length} data-testid="dispersao" style={{ fontFamily: "Inter, Arial, sans-serif" }}>
      {ex.marcas.map((m) => <g key={"x" + m}><line x1={M + ex.pos(m)} x2={M + ex.pos(m)} y1={T} y2={H - B} stroke="#f1f3f5" /><text x={M + ex.pos(m)} y={H - B + 12} fontSize={9} textAnchor="middle" fill="#868e96">{fmt(m)}</text></g>)}
      {ey.marcas.map((m) => <g key={"y" + m}><line x1={M} x2={W - 12} y1={H - B - ey.pos(m)} y2={H - B - ey.pos(m)} stroke="#f1f3f5" /><text x={M - 4} y={H - B - ey.pos(m) + 3} fontSize={9} textAnchor="end" fill="#868e96">{fmt(m)}</text></g>)}
      <rect x={M} y={T} width={W - M - 12} height={H - T - B} fill="none" stroke="#dee2e6" />
      {pontos.filter((p) => !log || (p.x > 0 && p.y > 0)).map((p, i) => <circle key={i} cx={M + ex.pos(p.x)} cy={H - B - ey.pos(p.y)} r={3.5} fill={p.cor} opacity={0.8}><title>{`${p.codigo} (${p.grupo}): ${ax} ${fmt(p.x)} · ${ay} ${fmt(p.y)}`}</title></circle>)}
      <text x={(W + M) / 2} y={H - 6} fontSize={11} textAnchor="middle">{ax} ({ux}){log ? " · log" : ""}</text>
      <text x={12} y={(H - B + T) / 2} fontSize={11} textAnchor="middle" transform={`rotate(-90 12 ${(H - B + T) / 2})`}>{ay} ({uy})</text>
      {r.map((c, i) => <text key={c.grupo} x={M} y={H + 14 + i * 20} fontSize={11} fill={c.cor}>{c.grupo}: n = {c.n} · Pearson r = {c.pearson == null ? "—" : c.pearson.toFixed(2)} · Spearman ρ = {c.spearman == null ? "—" : c.spearman.toFixed(2)}</text>)}
    </svg>
  );
}

/** Matriz de correlação (Spearman) de um grupo; cor azul (negativa) → vermelho (positiva). */
export function MatrizCorrelacao({ grupo, analitos, corr }: { grupo: string; analitos: string[]; corr: Record<string, { n: number; pearson: number | null; spearman: number | null }> }) {
  const c = 46, M = 52;
  const val = (a: string, b: string) => (a === b ? 1 : (corr[`${a}|${b}`] ?? corr[`${b}|${a}`])?.spearman ?? null);
  const cor = (v: number | null) => {
    if (v == null) return "#f1f3f5";
    const k = Math.abs(v), base = v >= 0 ? [215, 25, 28] : [44, 123, 182];
    return `rgb(${base.map((x) => Math.round(255 - (255 - x) * k)).join(",")})`;
  };
  return (
    <svg width={M + c * analitos.length + 4} height={M + c * analitos.length + 20} data-testid={`correlacao-${grupo}`} style={{ fontFamily: "Inter, Arial, sans-serif" }}>
      <text x={4} y={12} fontSize={11} fontWeight={700}>{grupo}</text>
      {analitos.map((a, i) => <text key={"c" + a} x={M + c * i + c / 2} y={M - 6} fontSize={10} textAnchor="middle" fontWeight={600}>{a}</text>)}
      {analitos.map((a, i) => (
        <g key={a}>
          <text x={M - 6} y={M + c * i + c / 2 + 4} fontSize={10} textAnchor="end" fontWeight={600}>{a}</text>
          {analitos.map((b, j) => {
            const v = val(a, b);
            return <g key={b}><rect x={M + c * j} y={M + c * i} width={c - 2} height={c - 2} fill={cor(v)} /><text x={M + c * j + c / 2 - 1} y={M + c * i + c / 2 + 3} fontSize={10} textAnchor="middle" fill={v != null && Math.abs(v) > 0.6 ? "#fff" : "#222"}>{v == null ? "—" : v.toFixed(2)}</text></g>;
          })}
        </g>
      ))}
      <text x={4} y={M + c * analitos.length + 14} fontSize={9} fill="#868e96">Spearman ρ (pares com os dois valores medidos)</text>
    </svg>
  );
}
