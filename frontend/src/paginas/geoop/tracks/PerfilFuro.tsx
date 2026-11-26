import { forwardRef, useRef } from "react";

import { classe, textoSobre } from "../../../geologia/classes";
import { escalaY, type ClassesTrack } from "./TracksGaleria";
import { LARGURA_PX, NOME_GEO, type Track, type TrackAnalito } from "./tipos";

export interface TermoP { id: string; nome: string; cor: string | null; sigla?: string | null }
export interface IntervaloP { id: string; de: number; ate: number; litologia: TermoP | null; alteracao: TermoP | null; mineralizacao: TermoP | null; estruturas: string | null; descricao: string | null; observacoes: string | null; atributos: Record<string, string> }
export interface AmostraP { id: string; codigo: string; de: number; ate: number; valores: Record<string, { y: number | null; texto: string; situacao: string; unidade: string; certificado: string }>; com_resultado: boolean; estado: string; xyz: number[] | null }
export interface Perfil {
  furo: { id: string; codigo: string; projeto: string | null; area: string | null; x: number; y: number; z: number; srid: number; azimute: number | null; inclinacao: number | null; profundidade_final: number; data_inicio: string | null; responsavel: string | null; metodo: string | null; referencia_azimute: string; declinacao: number };
  trajetoria: { estimada: boolean; motivo: string; srid: number; convertida: boolean; aviso_crs: string | null; pontos: number[][]; estacoes: { profundidade: number; xyz: number[] }[] } | null;
  erro_trajetoria: string | null; survey: { profundidade: number; azimute: number; inclinacao: number }[];
  intervalos: IntervaloP[]; amostras: AmostraP[]; sem_profundidade: string[]; unidades: Record<string, string>; regra_ld_descricao: string;
}

const CAB = 40, REGUA = 46, GAP = 2;

/**
 * Perfil por profundidade: tracks lado a lado com o mesmo eixo de profundidade (real, de/até das amostras e intervalos).
 * Amostras pontuais ficam como estão; nada é interpolado nem estendido.
 */
export const PerfilFuro = forwardRef<SVGSVGElement, {
  p: Perfil; tracks: Track[]; classes: Record<string, ClassesTrack>; faixa: [number, number]; aoFaixa: (f: [number, number]) => void;
  altura: number; selecionado: string | null; aoSelecionar: (id: string) => void; aoIntervalo: (i: IntervaloP) => void;
  selecao: [number, number] | null; aoSelecao: (s: [number, number] | null) => void; aoConfigurar: (id: string) => void;
}>(function PerfilFuro({ p, tracks, classes, faixa, aoFaixa, altura, selecionado, aoSelecionar, aoIntervalo, selecao, aoSelecao, aoConfigurar }, ref) {
  const [d0, d1] = faixa;
  const H = altura;
  const yD = (d: number) => CAB + ((d - d0) / (d1 - d0)) * H;
  const dY = (y: number) => d0 + ((y - CAB) / H) * (d1 - d0);
  let x = REGUA + 4;
  const cols = tracks.map((t) => { const w = LARGURA_PX[t.altura]; const c = { t, x, w }; x += w + GAP; return c; });
  const largura = x + 4;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const arrasto = useRef<{ y: number; d: number; f: [number, number]; sel: boolean; moveu: boolean } | null>(null);
  const yDe = (clientY: number) => { const r = svgRef.current!.getBoundingClientRect(); return dY(clientY - r.top); };
  const passo = [0.5, 1, 2, 5, 10, 20, 25, 50, 100].find((s) => (H / (d1 - d0)) * s > 28) ?? 100;
  const marcas: number[] = [];
  for (let m = Math.ceil(d0 / passo) * passo; m <= d1; m += passo) marcas.push(Number(m.toFixed(3)));
  const visivel = (de: number, ate: number) => ate > d0 && de < d1;
  const clip = (de: number, ate: number) => [Math.max(de, d0), Math.min(ate, d1)] as const;

  function geo(t: Track, cx: number, w: number) {
    const campo = t.tipo as "litologia" | "alteracao" | "mineralizacao";
    if (t.tipo === "amostras") {
      return p.amostras.filter((a) => visivel(a.de, a.ate)).map((a) => {
        const [a0, a1] = clip(a.de, a.ate), y0 = yD(a0), h = Math.max(1, yD(a1) - y0);
        const cor = a.com_resultado ? "#d3f9d8" : a.estado === "enviada" ? "#fff3bf" : "#f1f3f5";
        return (
          <g key={a.id} data-amostra={a.codigo} style={{ cursor: "pointer" }} onClick={() => aoSelecionar(a.id)}>
            <rect x={cx} y={y0} width={w} height={h} fill={cor} stroke={a.id === selecionado ? "#1971c2" : "#adb5bd"} strokeWidth={a.id === selecionado ? 2.5 : 0.6} />
            {h >= 11 && <text x={cx + w / 2} y={y0 + h / 2 + 3.5} fontSize={9} textAnchor="middle" fill="#222">{a.codigo.replace(/^BMT-TS-/, "TS-")}</text>}
            <title>{`${a.codigo}: ${a.de}–${a.ate} m${a.com_resultado ? "" : " (sem resultado)"}`}</title>
          </g>
        );
      });
    }
    return p.intervalos.filter((i) => visivel(i.de, i.ate)).map((i) => {
      const [a0, a1] = clip(i.de, i.ate), y0 = yD(a0), h = Math.max(1, yD(a1) - y0);
      if (t.tipo === "estruturas" || t.tipo === "descricao") {
        const txt = t.tipo === "estruturas" ? i.estruturas : i.descricao;
        if (!txt) return null;
        return (
          <g key={i.id} style={{ cursor: "pointer" }} onClick={() => aoIntervalo(i)}>
            <rect x={cx} y={y0} width={w} height={h} fill="#fff" stroke="#e9ecef" strokeWidth={0.5} />
            <foreignObject x={cx + 1} y={y0 + 1} width={w - 2} height={Math.max(0, h - 2)}><div style={{ fontSize: 9, lineHeight: "10px", overflow: "hidden", height: Math.max(0, h - 2), color: "#333" }}>{txt}</div></foreignObject>
          </g>
        );
      }
      const termo = i[campo];
      const original = !termo ? i.atributos?.[`${campo}_original`] : null;
      if (!termo && !original) return null; // intervalo sem esse atributo: em branco
      const cor = termo?.cor ?? "#e9ecef";
      return (
        <g key={i.id} style={{ cursor: "pointer" }} onClick={() => aoIntervalo(i)} data-intervalo={`${i.de}-${i.ate}`}>
          <rect x={cx} y={y0} width={w} height={h} fill={cor} stroke="#868e96" strokeWidth={0.5} strokeDasharray={original ? "3 2" : undefined} />
          {h >= 11 && <text x={cx + w / 2} y={y0 + h / 2 + 3.5} fontSize={9} textAnchor="middle" fill={textoSobre(cor)}>{(termo?.sigla || termo?.nome || original || "").slice(0, Math.floor(w / 5.5))}</text>}
          <title>{`${i.de}–${i.ate} m: ${termo?.nome ?? `"${original}" (fora do dicionário)`}`}</title>
        </g>
      );
    });
  }

  function analito(t: TrackAnalito, cx: number, w: number) {
    const c = classes[t.id];
    return p.amostras.filter((a) => visivel(a.de, a.ate)).map((a) => {
      const [a0, a1] = clip(a.de, a.ate), y0 = yD(a0), h = Math.max(1, yD(a1) - y0);
      const v = a.valores[t.analito];
      const sel = a.id === selecionado;
      if (!v || v.y == null || !c) {
        return <rect key={a.id} x={cx} y={y0} width={w} height={h} fill="url(#semresP)" stroke={sel ? "#1971c2" : "#dee2e6"} strokeWidth={sel ? 2 : 0.5} onClick={() => aoSelecionar(a.id)} style={{ cursor: "pointer" }} />;
      }
      const cor = c.cores[classe(v.y, c.lim)];
      const ld = v.situacao !== "medido";
      const e = escalaY({ ...t }, c, w); // escala horizontal: reaproveita a mesma função (0 = esquerda)
      const xv = cx + (w - e.y(v.y));
      let corpo;
      if (t.representacao === "faixa") corpo = <rect x={cx} y={y0} width={w} height={h} fill={cor} stroke={ld ? "#222" : "#868e96"} strokeWidth={ld ? 1.2 : 0.4} strokeDasharray={ld ? "3 2" : undefined} />;
      else if (t.representacao === "barras") corpo = <><rect x={cx} y={y0} width={w} height={h} fill="#fafafa" /><rect x={cx} y={y0} width={Math.max(1, xv - cx)} height={h} fill={cor} stroke={ld ? "#222" : "none"} strokeDasharray={ld ? "3 2" : undefined} /></>;
      else corpo = <><rect x={cx} y={y0} width={w} height={h} fill="#fafafa" />{ld ? <path d={`M${xv - 4},${y0 + h / 2 - 4} L${xv + 4},${y0 + h / 2 - 4} L${xv},${y0 + h / 2 + 4}Z`} fill="#fff" stroke={cor} strokeWidth={1.6} /> : <circle cx={xv} cy={y0 + h / 2} r={4} fill={cor} stroke="#333" strokeWidth={0.5} />}</>;
      return (
        <g key={a.id} onClick={() => aoSelecionar(a.id)} style={{ cursor: "pointer" }} data-valor={`${a.codigo}:${v.texto}`}>
          {corpo}
          {t.valores && h >= 11 && <text x={t.representacao === "faixa" ? cx + w / 2 : cx + w - 3} y={y0 + h / 2 + 3.5} fontSize={9} textAnchor={t.representacao === "faixa" ? "middle" : "end"} fill={t.representacao === "faixa" ? textoSobre(cor) : "#333"}>{v.texto}</text>}
          {sel && <rect x={cx} y={y0} width={w} height={h} fill="none" stroke="#1971c2" strokeWidth={2.5} />}
          <title>{`${a.codigo} ${a.de}–${a.ate} m · ${t.analito}: ${v.texto} ${v.unidade}`}</title>
        </g>
      );
    });
  }

  return (
    <svg ref={(el) => { svgRef.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
      xmlns="http://www.w3.org/2000/svg" data-testid={`perfil-${p.furo.codigo}`} width={largura} height={CAB + H + 6} style={{ display: "block", fontFamily: "Inter, Arial, sans-serif", userSelect: "none" }}
      onWheel={(e) => {
        const d = yDe(e.clientY), k = e.deltaY > 0 ? 1.25 : 0.8, span = Math.min(p.furo.profundidade_final, Math.max(1, (d1 - d0) * k));
        let a = d - (d - d0) * (span / (d1 - d0));
        a = Math.max(0, Math.min(p.furo.profundidade_final - span, a));
        aoFaixa([a, a + span]);
      }}
      onPointerDown={(e) => { if ((e.target as Element).closest("[data-cab]")) return; arrasto.current = { y: e.clientY, d: yDe(e.clientY), f: faixa, sel: e.shiftKey, moveu: false }; }}
      onPointerMove={(e) => {
        const a = arrasto.current;
        if (!a) return;
        if (Math.abs(e.clientY - a.y) > 4) a.moveu = true;
        if (!a.moveu) return;
        if (a.sel) { const d = yDe(e.clientY); aoSelecao([Math.max(0, Math.min(a.d, d)), Math.min(p.furo.profundidade_final, Math.max(a.d, d))]); return; }
        const dd = ((a.y - e.clientY) / H) * (a.f[1] - a.f[0]), span = a.f[1] - a.f[0];
        const ini = Math.max(0, Math.min(p.furo.profundidade_final - span, a.f[0] + dd));
        aoFaixa([ini, ini + span]);
      }}
      onPointerUp={() => { arrasto.current = null; }} onPointerLeave={() => { arrasto.current = null; }}>
      <defs><pattern id="semresP" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><rect width="1.5" height="6" fill="#d0d0d0" /></pattern></defs>
      <rect width={largura} height={CAB + H + 6} fill="#fff" />
      {/* régua de profundidade */}
      <text x={4} y={CAB - 8} fontSize={10} fontWeight={700}>Prof. (m)</text>
      {marcas.map((m) => <g key={m}><line x1={REGUA - 6} y1={yD(m)} x2={largura} y2={yD(m)} stroke="#f1f3f5" /><text x={REGUA - 8} y={yD(m) + 3} fontSize={9} textAnchor="end" fill="#495057">{m}</text></g>)}
      <line x1={REGUA - 2} y1={CAB} x2={REGUA - 2} y2={CAB + H} stroke="#495057" />
      {p.furo.profundidade_final <= d1 && <g><line x1={REGUA - 6} y1={yD(p.furo.profundidade_final)} x2={largura} y2={yD(p.furo.profundidade_final)} stroke="#e03131" strokeDasharray="4 3" /><text x={largura - 4} y={yD(p.furo.profundidade_final) - 3} fontSize={9} textAnchor="end" fill="#e03131">fim do furo {p.furo.profundidade_final} m</text></g>}
      {selecao && <rect x={REGUA} y={yD(Math.max(selecao[0], d0))} width={largura - REGUA} height={Math.max(1, yD(Math.min(selecao[1], d1)) - yD(Math.max(selecao[0], d0)))} fill="#fab005" opacity={0.18} />}
      {cols.map(({ t, x: cx, w }) => (
        <g key={t.id} data-track={t.tipo === "analito" ? (t as TrackAnalito).analito : t.tipo}>
          <g data-cab style={{ cursor: "pointer" }} onClick={() => aoConfigurar(t.id)}>
            <rect x={cx} y={0} width={w} height={CAB - 4} fill="#f8f9fa" />
            <text x={cx + 4} y={14} fontSize={11} fontWeight={700}>{t.tipo === "analito" ? (t as TrackAnalito).analito : NOME_GEO[t.tipo]}</text>
            <text x={cx + 4} y={28} fontSize={9} fill="#868e96">{t.tipo === "analito" ? `${classes[t.id]?.unidade ?? ""} ${t.representacao !== "faixa" && t.escala === "log" ? "log" : ""} ⚙` : "⚙"}</text>
          </g>
          <rect x={cx} y={CAB} width={w} height={H} fill="none" stroke="#dee2e6" />
          <svg x={0} y={0} width={largura} height={CAB + H} overflow="hidden">
            <clipPath id={`clip-${t.id}`}><rect x={cx} y={CAB} width={w} height={H} /></clipPath>
            <g clipPath={`url(#clip-${t.id})`}>{t.tipo === "analito" ? analito(t as TrackAnalito, cx, w) : geo(t, cx, w)}</g>
          </svg>
        </g>
      ))}
    </svg>
  );
});
