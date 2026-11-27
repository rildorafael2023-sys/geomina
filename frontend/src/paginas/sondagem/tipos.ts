import { createContext, useContext } from "react";

import { api, type Mina } from "../../api/cliente";
import type { TermoP } from "../../componentes/perfil";

export type TipoFuro = "exploratorio" | "ina";
export type FiltroTipo = "todos" | TipoFuro;

export interface FuroResumo {
  id: string; codigo: string; projeto: string | null; area: string | null; profundidade_final: number; azimute: number | null; inclinacao: number | null;
  intervalos: number; amostras: number; amostras_com_resultado: number; fotos: number; tipo: TipoFuro; data_inicio: string | null;
}

export interface IntervaloP {
  id: string; de: number; ate: number; espessura: number; litologia: TermoP | null; litologia_texto: string | null; alteracao: TermoP | null;
  mineralizacao: TermoP | null; estruturas: string | null; descricao: string | null; observacoes: string | null; rqd: number | null;
  classe_rqd: ClasseRqd | null; recuperacao: number | null; caixa: string | null; marca_esmeralda: boolean | null; ocorrencias: string[];
  material: "solo" | "saprolito" | "nao_recuperado" | null; cota_topo: number | null; cota_base: number | null;
}
export interface AmostraP {
  id: string; codigo: string; de: number; ate: number; com_resultado: boolean;
  valores: Record<string, { y: number | null; texto: string; situacao: string; unidade: string; certificado: string }>;
}
export interface FotoP { id: string; documento_id: string; versao: number; titulo: string; de: number | null; ate: number | null; caixa: string | null; legenda: string | null; categoria: string; mime: string | null }
export type ClasseRqd = "excelente" | "bom" | "razoavel" | "ruim" | "muito_ruim";
export interface PerfilP {
  furo: { id: string; codigo: string; projeto: string | null; area: string | null; x: number | null; y: number | null; z: number | null; srid: number; azimute: number | null; inclinacao: number | null; profundidade_final: number; data_inicio: string | null; data_fim: string | null; responsavel: string | null; metodo: string | null; descricao: string | null; tipo: TipoFuro };
  intervalos: IntervaloP[];
  amostras: AmostraP[];
  sem_profundidade: string[];
  analitos: string[];
  unidades: Record<string, string>;
  grupos: Record<string, "ppm" | "%" | "ppb" | "outras">;
  rqd: { classes: Record<ClasseRqd, number>; media: number; metros: number; trechos: number } | null;
  fotos: FotoP[];
  trajetoria: { estimada: boolean; motivo: string | null } | null;
  survey: unknown[];
}

export const CLASSES_RQD: { chave: ClasseRqd; rotulo: string; cor: string }[] = [
  { chave: "excelente", rotulo: "Excelente", cor: "#2f9e44" },
  { chave: "bom", rotulo: "Bom", cor: "#94d82d" },
  { chave: "razoavel", rotulo: "Razoável", cor: "#fcc419" },
  { chave: "ruim", rotulo: "Ruim", cor: "#ff922b" },
  { chave: "muito_ruim", rotulo: "Muito ruim", cor: "#e03131" },
];
export const corRqd = (c: ClasseRqd | null) => CLASSES_RQD.find((x) => x.chave === c)?.cor ?? "#ced4da";

export const OCORRENCIA: Record<string, { rotulo: string; cor: string; letra: string }> = {
  esmeralda: { rotulo: "Esmeralda", cor: "#2b8a3e", letra: "E" },
  berilo: { rotulo: "Berilo", cor: "#74b816", letra: "B" },
  molibdenita: { rotulo: "Molibdenita", cor: "#495057", letra: "Mo" },
  agua: { rotulo: "Água", cor: "#1c7ed6", letra: "A" },
  carbonato: { rotulo: "Carbonato", cor: "#a0855b", letra: "C" },
  sulfeto: { rotulo: "Sulfetos", cor: "#c9a227", letra: "S" },
  perda: { rotulo: "Não recuperado", cor: "#adb5bd", letra: "—" },
};

const CORES_MATERIAL: Record<string, string> = { solo: "#d9c3a5", saprolito: "#e8d9b5", nao_recuperado: "#f1f3f5" };
export const corMaterial = (m: string | null) => (m ? CORES_MATERIAL[m] : null);

/** Cores fixas das barras de cada elemento, na ordem em que foram escolhidos (como no vídeo: verde, rosa, azul…). */
export const CORES_ELEMENTOS = ["#2f9e44", "#e64980", "#1c7ed6", "#f08c00", "#7048e8", "#0c8599", "#c92a2a", "#5c940d", "#862e9c", "#e8590c"];
export const CORES_FUROS = ["#0b7285", "#f08c00", "#7048e8", "#c2255c", "#2f9e44", "#1c7ed6"];

export const numeroTeor = (t: string | undefined | null): number | null => {
  if (!t) return null;
  const n = Number(t.replace("<", "").replace(">", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export interface Ctx {
  mina: Mina;
  pode: boolean;
  filtro: FiltroTipo;
  furos: FuroResumo[];
  furo: string | null;
  setFuro: (id: string | null) => void;
  elementos: string[];
  setElementos: (e: string[]) => void;
}
export const SondagemCtx = createContext<Ctx | null>(null);
export const useSondagem = () => useContext(SondagemCtx)!;

/** Mediana e faixa de uma lista de números. */
export function estat(v: number[]) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number) => { const i = (s.length - 1) * p, a = Math.floor(i), b = Math.ceil(i); return s[a] + (s[b] - s[a]) * (i - a); };
  return { n: s.length, min: s[0], max: s[s.length - 1], mediana: q(0.5), q1: q(0.25), q3: q(0.75) };
}

export const fmt = (v: number | null | undefined, casas = 2) => (v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));

/** Baixa um texto como arquivo (CSV com ; abre direto no Excel em português). */
export function baixarTexto(texto: string, nome: string, tipo = "text/csv;charset=utf-8") {
  const b = new Blob([tipo.startsWith("text/csv") ? "\ufeff" + texto : texto], { type: tipo });
  const u = URL.createObjectURL(b), l = document.createElement("a");
  l.href = u; l.download = nome; l.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export function baixarSvg(svg: SVGSVGElement | null, nome: string, formato: "svg" | "png") {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("foreignObject").forEach((n) => n.remove());
  const texto = new XMLSerializer().serializeToString(clone);
  if (formato === "svg") return baixarTexto(texto, `${nome}.svg`, "image/svg+xml");
  const img = new Image();
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value;
  img.onload = () => {
    const cv = document.createElement("canvas");
    cv.width = w * 2; cv.height = h * 2;
    const x = cv.getContext("2d")!;
    x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.scale(2, 2); x.drawImage(img, 0, 0);
    cv.toBlob((b) => { if (!b) return; const u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = `${nome}.png`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); });
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(texto);
}

/** Marcas "redondas" de um eixo (linear ou log). */
export function marcas(min: number, max: number, log = false): number[] {
  if (log) {
    const r: number[] = [];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) r.push(10 ** e);
    return r;
  }
  const span = max - min || Math.abs(max) || 1, bruto = span / 5, p = 10 ** Math.floor(Math.log10(bruto));
  const s = [1, 2, 5, 10].map((k) => k * p).find((k) => k >= bruto) ?? 10 * p;
  const r: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + s * 1e-9; v += s) r.push(Number(v.toPrecision(12)));
  return r;
}

/** Consulta do perfil completo de um furo (todos os analitos). A chave começa com "log-furo" para que as edições do cadastro atualizem tudo. */
export const consultaPerfil = (id: string, regra = "limite") => ({
  queryKey: ["log-furo", id, regra],
  queryFn: () => api<PerfilP>(`/furos/${id}/perfil?analitos=*&regra_ld=${regra}`),
  staleTime: 30_000,
});

/** Trecho do log que contém a profundidade (meio de uma amostra, por exemplo). */
export const trechoEm = (ints: IntervaloP[], prof: number) => ints.find((i) => i.de <= prof && prof <= i.ate) ?? null;
export const nomeLito = (i: IntervaloP | null) => i?.litologia?.nome ?? i?.litologia_texto ?? "sem descrição";

/** Elementos sugeridos para esmeralda/xisto (os que existirem); senão os seis primeiros do laudo. */
export function padraoElementos(disponiveis: string[]) {
  const pref = ["Be", "Cr", "Li", "MgO", "Mo", "V", "Rb", "Cs", "K2O", "Fe2O3"].filter((a) => disponiveis.includes(a));
  return pref.length >= 3 ? pref.slice(0, 6) : disponiveis.slice(0, 6);
}

export function lerLocal<T>(k: string, padrao: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
}
export function gravarLocal(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ }
}
