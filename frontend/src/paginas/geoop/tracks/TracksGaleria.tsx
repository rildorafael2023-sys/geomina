import { forwardRef, useEffect, useRef, useState } from "react";

import { classe, textoSobre } from "../../../geologia/classes";
import type { Dados, Valor } from "../../analise/Longitudinal";
import { ALTURA_PX, NOME_GEO, type Track, type TrackAnalito } from "./tipos";

export type Amostra = Dados["amostras"][number] & {
  descricao?: string | null; estado?: string; ficha_id?: string | null; tipo?: string | null;
  alteracao?: { id: string; nome: string; cor: string | null } | null; mineralizacao?: { id: string; nome: string; cor: string | null } | null;
  medidas?: { tipo: string; sigla: string; cor: string | null; classe: string; atitude: string; familia: string | null }[];
  documentos?: Record<string, number>;
};
export interface ClassesTrack { lim: number[]; cores: string[]; unidade: string; min: number; max: number }

const ROT = 132; // coluna de rótulos
const GAP = 3;

/** Escala vertical própria do track (linear ou log) entre mín e máx. */
export function escalaY(t: TrackAnalito, c: ClassesTrack, h: number) {
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  let lo = num(t.min) ?? c.min, hi = num(t.max) ?? c.max;
  if (t.escala === "log") { lo = Math.max(lo, hi > 0 ? hi / 1e4 : 1e-6, 1e-9); hi = Math.max(hi, lo * 10); }
  if (hi <= lo) hi = lo + 1;
  const f = t.escala === "log" ? Math.log10 : (x: number) => x;
  const a = f(lo), b = f(hi);
  return { lo, hi, y: (v: number) => { const k = (f(Math.max(v, t.escala === "log" ? lo : -Infinity)) - a) / (b - a); return h - 4 - Math.max(0, Math.min(1, k)) * (h - 10); } };
}

/**
 * Tracks lado a lado, uma coluna por amostra na sequência da galeria (sem escala de distância — decisão do usuário).
 * Janela de colunas compartilhada por todos os tracks: roda = zoom, arrastar = deslocar, Shift+arrastar = selecionar trecho.
 */
export const TracksGaleria = forwardRef<SVGSVGElement, {
  amostras: Amostra[]; tracks: Track[]; classes: Record<string, ClassesTrack>; janela: [number, number];
  aoJanela: (j: [number, number]) => void; selecionado: string | null; aoSelecionar: (id: string) => void;
  trecho: [number, number] | null; aoTrecho: (t: [number, number] | null) => void; aoConfigurar: (trackId: string) => void;
}>(function TracksGaleria({ amostras, tracks, classes, janela, aoJanela, selecionado, aoSelecionar, trecho, aoTrecho, aoConfigurar }, ref) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(900);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [i0, i1] = janela;
  const vis = amostras.slice(i0, i1 + 1);
  const W = Math.max(8, (largura - ROT - 4) / Math.max(1, vis.length));
  const H_PONTO = 16;
  let y = H_PONTO;
  const pos = tracks.map((t) => { const h = ALTURA_PX[t.altura]; const p = { t, y, h }; y += h + GAP; return p; });
  const altura = y + 2;
  const xCol = (i: number) => ROT + (i - i0) * W;
  const arrasto = useRef<{ x: number; i: number; j: [number, number]; sel: boolean; moveu: boolean } | null>(null);
  const colunaEm = (clientX: number) => {
    const r = caixa.current!.getBoundingClientRect();
    return Math.max(i0, Math.min(i1, i0 + Math.floor((clientX - r.left - ROT) / W)));
  };
  const texto = W >= 40, curto = W >= 26;

  function celulaAnalito(t: TrackAnalito, a: Amostra, x: number, yy: number, h: number) {
    const v: Valor | undefined = a.valores[t.analito];
    const c = classes[t.id];
    if (!v || v.y == null || !c) {
      return <rect x={x + 1} y={yy + 1} width={W - 2} height={h - 2} fill="url(#semres)" stroke="#ddd" strokeWidth={0.5} />;
    }
    const cor = c.cores[classe(v.y, c.lim)];
    const ld = v.situacao !== "medido";
    if (t.representacao === "faixa") {
      return (
        <g>
          <rect x={x + 1} y={yy + 1} width={W - 2} height={h - 2} fill={cor} stroke={ld ? "#222" : "#999"} strokeWidth={ld ? 1.3 : 0.4} strokeDasharray={ld ? "4 2" : undefined} />
          {t.valores && curto && <text x={x + W / 2} y={yy + h / 2 + 4} fontSize={W >= 50 ? 11 : 9} fontWeight={600} textAnchor="middle" fill={textoSobre(cor)}>{v.texto}</text>}
        </g>
      );
    }
    const e = escalaY(t, c, h);
    const yv = yy + e.y(v.y);
    if (t.representacao === "barras") {
      return (
        <g>
          <rect x={x + Math.max(1, W * 0.18)} y={yv} width={Math.max(2, W * 0.64)} height={yy + h - 2 - yv} fill={cor} stroke={ld ? "#222" : "none"} strokeDasharray={ld ? "3 2" : undefined} />
          {t.valores && texto && <text x={x + W / 2} y={Math.max(yy + 10, yv - 2)} fontSize={9} textAnchor="middle" fill="#333">{v.texto}</text>}
        </g>
      );
    }
    return (
      <g>
        {ld ? <path d={`M${x + W / 2 - 5},${yv - 4} L${x + W / 2 + 5},${yv - 4} L${x + W / 2},${yv + 4} Z`} fill="#fff" stroke={cor} strokeWidth={1.8} />
          : <circle cx={x + W / 2} cy={yv} r={Math.min(5, W / 3)} fill={cor} stroke="#333" strokeWidth={0.6} />}
        {t.valores && texto && <text x={x + W / 2} y={Math.max(yy + 9, yv - 7)} fontSize={9} textAnchor="middle" fill="#333">{v.texto}</text>}
      </g>
    );
  }

  function celulaGeo(t: Track, a: Amostra, x: number, yy: number, h: number) {
    const termo = (r: { nome: string; cor: string | null } | null | undefined) => r
      ? <g><rect x={x + 1} y={yy + 1} width={W - 2} height={h - 2} fill={r.cor ?? "#dee2e6"} stroke="#999" strokeWidth={0.4} />
        {curto && <text x={x + W / 2} y={yy + h / 2 + 3} fontSize={9} textAnchor="middle" fill={textoSobre(r.cor ?? "#dee2e6")}>{r.nome.length * 5 > W ? r.nome.slice(0, Math.max(2, Math.floor(W / 6))) + "…" : r.nome}</text>}</g>
      : null; // sem registro: célula vazia (não inventa contato)
    switch (t.tipo) {
      case "amostras": {
        const corSt = a.estado === "cancelada" ? "#fa5252" : Object.keys(a.valores).length ? "#2f9e44" : a.estado === "enviada" ? "#f59f00" : "#adb5bd";
        return (
          <g>
            <circle cx={x + 6} cy={yy + 7} r={3} fill={corSt} />
            {curto && <text x={x + W / 2} y={yy + h - 6} fontSize={W >= 60 ? 10 : 8} textAnchor="middle" fill="#222">{a.codigo.replace(/^BS-RP-/, "RP-").replace(/^BMT-TS-/, "TS-")}</text>}
            {a.secao_de_m != null && texto && <text x={x + W - 3} y={yy + 10} fontSize={8} textAnchor="end" fill="#888">{a.secao_de_m}–{a.secao_ate_m}</text>}
          </g>
        );
      }
      case "litologia": return termo(a.litologia);
      case "alteracao": return termo(a.alteracao);
      case "mineralizacao": return termo(a.mineralizacao);
      case "estruturas": {
        const m = a.medidas ?? [];
        if (!m.length) return null;
        return (
          <g>
            {m.slice(0, Math.max(1, Math.floor((h - 4) / 12))).map((x_, k) => (
              <text key={k} x={x + 3} y={yy + 11 + k * 12} fontSize={9} fill={x_.cor ?? "#333"}>{texto ? `${x_.sigla} ${x_.atitude}` : x_.sigla}</text>
            ))}
          </g>
        );
      }
      case "descricao":
        return a.descricao ? (
          <foreignObject x={x + 1} y={yy + 1} width={W - 2} height={h - 2}>
            <div style={{ fontSize: 9, lineHeight: "10px", overflow: "hidden", height: h - 2, color: "#333", padding: 1 }}>{a.descricao}</div>
          </foreignObject>
        ) : null;
      case "fotos": {
        const f = a.documentos?.foto ?? 0, c = a.documentos?.croqui ?? 0;
        if (!f && !c) return null;
        return <text x={x + W / 2} y={yy + h / 2 + 4} fontSize={10} textAnchor="middle" fill="#1c7ed6">{texto ? `${f ? `📷${f}` : ""}${c ? ` ✎${c}` : ""}` : "●"}</text>;
      }
    }
    return null;
  }

  return (
    <div ref={caixa} style={{ width: "100%", userSelect: "none" }}
      onWheel={(e) => {
        if (!amostras.length) return;
        const n = i1 - i0 + 1, k = e.deltaY > 0 ? 1.25 : 0.8;
        const novo = Math.max(3, Math.min(amostras.length, Math.round(n * k)));
        const c = colunaEm(e.clientX);
        let a = Math.round(c - (c - i0) * (novo / n));
        a = Math.max(0, Math.min(amostras.length - novo, a));
        aoJanela([a, a + novo - 1]);
      }}
      onPointerDown={(e) => { arrasto.current = { x: e.clientX, i: colunaEm(e.clientX), j: janela, sel: e.shiftKey, moveu: false }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => {
        const a = arrasto.current;
        if (!a) return;
        if (Math.abs(e.clientX - a.x) > 4) a.moveu = true;
        if (!a.moveu) return;
        if (a.sel) { const c = colunaEm(e.clientX); aoTrecho([Math.min(a.i, c), Math.max(a.i, c)]); return; }
        const d = Math.round((a.x - e.clientX) / W), n = a.j[1] - a.j[0];
        const ini = Math.max(0, Math.min(amostras.length - 1 - n, a.j[0] + d));
        if (ini !== i0) aoJanela([ini, ini + n]);
      }}
      onPointerUp={(e) => {
        const a = arrasto.current;
        arrasto.current = null;
        if (a && !a.moveu) {
          const r = caixa.current!.getBoundingClientRect();
          if (e.clientX - r.left < ROT) return;
          const am = amostras[colunaEm(e.clientX)];
          if (am) aoSelecionar(am.id);
        }
      }}>
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" data-testid="tracks" width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} style={{ display: "block", fontFamily: "Inter, Arial, sans-serif", cursor: "grab" }}>
        <defs>
          <pattern id="semres" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><rect width="1.5" height="6" fill="#d0d0d0" /></pattern>
        </defs>
        <rect width={largura} height={altura} fill="#fff" />
        {/* seleção de trecho */}
        {trecho && trecho[1] >= i0 && trecho[0] <= i1 && (
          <rect x={xCol(Math.max(trecho[0], i0))} y={0} width={(Math.min(trecho[1], i1) - Math.max(trecho[0], i0) + 1) * W} height={altura} fill="#fab005" opacity={0.18} />
        )}
        {/* número do ponto (sequência na galeria) */}
        {vis.map((a, k) => {
          const i = i0 + k, novo = i === 0 || amostras[i - 1].ponto !== a.ponto;
          return novo ? <g key={`p${a.id}`}><line x1={xCol(i)} y1={0} x2={xCol(i)} y2={altura} stroke="#ced4da" strokeWidth={1} />{curto && <text x={xCol(i) + 3} y={11} fontSize={10} fontWeight={700} fill="#495057">{a.ponto}</text>}</g> : null;
        })}
        {pos.map(({ t, y: yy, h }) => (
          <g key={t.id} data-track={t.tipo === "analito" ? t.analito : t.tipo}>
            <rect x={0} y={yy} width={ROT - 4} height={h} fill="#f8f9fa" />
            <g style={{ cursor: "pointer" }} onClick={() => aoConfigurar(t.id)} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              <rect x={0} y={yy} width={ROT - 4} height={h} fill="transparent" />
              <text x={4} y={yy + Math.min(h / 2 + 4, 15)} fontSize={10} fill="#adb5bd">⚙</text>
              <text x={18} y={yy + Math.min(h / 2 + 4, 15)} fontSize={11} fontWeight={700} fill="#212529">
                {t.tipo === "analito" ? t.analito : NOME_GEO[t.tipo]}
                {t.tipo === "analito" && <tspan fontSize={9} fontWeight={400} fill="#868e96"> {classes[t.id]?.unidade}{t.representacao !== "faixa" && t.escala === "log" ? " · log" : ""}</tspan>}
              </text>
              {t.tipo === "analito" && t.representacao !== "faixa" && classes[t.id] && h >= 40 && (() => {
                const e = escalaY(t, classes[t.id], h);
                const f = (v: number) => v.toLocaleString("pt-BR", { maximumSignificantDigits: 3 });
                return <><text x={ROT - 8} y={yy + 12} fontSize={8} textAnchor="end" fill="#868e96">{f(e.hi)}</text><text x={ROT - 8} y={yy + h - 3} fontSize={8} textAnchor="end" fill="#868e96">{f(e.lo)}</text></>;
              })()}
            </g>
            {t.tipo === "analito" && t.ligar && t.representacao === "pontos" && classes[t.id] && (() => {
              const e = escalaY(t, classes[t.id], h);
              const pts = vis.map((a, k) => ({ a, k })).filter(({ a }) => a.valores[t.analito]?.situacao === "medido");
              return <polyline points={pts.map(({ a, k }) => `${xCol(i0 + k) + W / 2},${yy + e.y(a.valores[t.analito].y as number)}`).join(" ")} fill="none" stroke="#adb5bd" strokeWidth={1} />;
            })()}
            {vis.map((a, k) => {
              const x = xCol(i0 + k);
              return <g key={a.id}>{t.tipo === "analito" ? celulaAnalito(t, a, x, yy, h) : celulaGeo(t, a, x, yy, h)}</g>;
            })}
            <line x1={ROT} y1={yy + h + GAP / 2} x2={largura} y2={yy + h + GAP / 2} stroke="#f1f3f5" />
          </g>
        ))}
        {/* amostra selecionada: contorno em todos os tracks */}
        {vis.map((a, k) => a.id === selecionado ? <rect key="sel" x={xCol(i0 + k) + 0.5} y={0.5} width={W - 1} height={altura - 1} fill="none" stroke="#1971c2" strokeWidth={2.5} data-testid="coluna-selecionada" data-sel={a.codigo} /> : null)}
        {/* colunas clicáveis (identificação para teste e acessibilidade) */}
        {vis.map((a, k) => <rect key={`c${a.id}`} x={xCol(i0 + k)} y={0} width={W} height={altura} fill="transparent" data-amostra={a.codigo}><title>{a.codigo}</title></rect>)}
      </svg>
    </div>
  );
});
