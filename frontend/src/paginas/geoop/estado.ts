/** Estado compartilhado da Geoquímica Operacional: os mesmos filtros, analitos e seleção valem em todas as abas. */
import { create } from "zustand";

export const FACETAS = [
  { chave: "nivel", rotulo: "Nível", grupo: "Local" },
  { chave: "galeria", rotulo: "Galeria / travessa / rampa", grupo: "Local" },
  { chave: "trecho", rotulo: "Trecho", grupo: "Local" },
  { chave: "litologia", rotulo: "Litologia", grupo: "Geologia" },
  { chave: "alteracao", rotulo: "Alteração", grupo: "Geologia" },
  { chave: "mineralizacao", rotulo: "Mineralização", grupo: "Geologia" },
  { chave: "campanha", rotulo: "Campanha", grupo: "Amostragem" },
  { chave: "responsavel", rotulo: "Responsável", grupo: "Amostragem" },
  { chave: "tipo", rotulo: "Tipo de amostragem", grupo: "Amostragem" },
  { chave: "serie", rotulo: "Série (BS-RP, BMT-TS, BE)", grupo: "Amostragem" },
  { chave: "status", rotulo: "Status do resultado", grupo: "Laboratório" },
  { chave: "cadastro", rotulo: "Cadastro", grupo: "Laboratório" },
  { chave: "laboratorio", rotulo: "Laboratório", grupo: "Laboratório" },
  { chave: "certificado", rotulo: "Certificado", grupo: "Laboratório" },
] as const;
export type Faceta = (typeof FACETAS)[number]["chave"];

export interface Opcao { valor: string; rotulo: string; n: number }
export interface Teor { analito: string | null; min: string; max: string }

interface Estado {
  filtros: Partial<Record<Faceta, string[]>>;
  texto: string;
  dataDe: string;
  dataAte: string;
  teor: Teor;
  analitos: string[];
  regraLd: "limite" | "metade" | "omitir";
  selecionado: string | null; // chave do registro (id da amostra ou "laudo:CÓDIGO")
  filtrosAbertos: boolean;
  alternar: (f: Faceta, valor: string) => void;
  definir: (f: Faceta, valores: string[]) => void;
  set: (p: Partial<Omit<Estado, "alternar" | "definir" | "set" | "limpar">>) => void;
  limpar: () => void;
}

const VAZIO = { filtros: {}, texto: "", dataDe: "", dataAte: "", teor: { analito: null, min: "", max: "" } };

export const useGeo = create<Estado>((set) => ({
  ...VAZIO, analitos: [], regraLd: "limite", selecionado: null, filtrosAbertos: true,
  alternar: (f, valor) => set((s) => {
    const atual = s.filtros[f] ?? [];
    return { filtros: { ...s.filtros, [f]: atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor] } };
  }),
  definir: (f, valores) => set((s) => ({ filtros: { ...s.filtros, [f]: valores } })),
  set: (p) => set(p),
  limpar: () => set(VAZIO),
}));

/** Parâmetros da API a partir do estado (os mesmos para tabela, faixa, exportação…). */
export function parametrosGeo(s: Pick<Estado, "filtros" | "texto" | "dataDe" | "dataAte" | "teor" | "analitos" | "regraLd">, extra: Record<string, string> = {}): URLSearchParams {
  const p = new URLSearchParams(extra);
  for (const [f, v] of Object.entries(s.filtros)) if (v && v.length) p.set(f, v.join(","));
  if (s.texto.trim()) p.set("texto", s.texto.trim());
  if (s.dataDe) p.set("data_de", s.dataDe);
  if (s.dataAte) p.set("data_ate", s.dataAte);
  if (s.teor.analito && (s.teor.min || s.teor.max)) {
    p.set("teor_analito", s.teor.analito);
    if (s.teor.min) p.set("teor_min", s.teor.min.replace(",", "."));
    if (s.teor.max) p.set("teor_max", s.teor.max.replace(",", "."));
  }
  if (s.analitos.length) p.set("analitos", s.analitos.join(","));
  p.set("regra_ld", s.regraLd);
  return p;
}

export interface Registro {
  chave: string; amostra_id: string | null; codigo: string; cadastrada: boolean; serie: string; status: string;
  nivel: Ref | null; galeria: Ref | null; trecho: Ref | null; unidade: Ref | null; local: string | null;
  x: number | null; y: number | null; z: number | null; srid: number | null; data: string | null;
  campanha: { id: string; codigo: string } | null; responsavel: { id: string; nome: string } | null; tipo: { id: string; nome: string } | null;
  litologia: Termo | null; alteracao: Termo | null; mineralizacao: Termo | null; ficha: { id: string; numero: string } | null;
  secao_de_m: number | null; secao_ate_m: number | null; furo: string | null; prof_de_m: number | null; prof_ate_m: number | null;
  descricao: string | null; laboratorios: Record<string, string>; certificados: Record<string, string>; analitos: string[]; n_resultados: number;
  valores?: Record<string, { y: number | null; texto: string; situacao: string; unidade: string; certificado: string }>;
}
interface Ref { id: string; codigo: string; nome: string }
interface Termo { id: string; nome: string; cor: string | null }
export interface Pagina { total: number; pagina: number; tamanho: number; resumo_status: Record<string, number>; opcoes: Record<Faceta, Opcao[]>; itens: Registro[]; status_rotulos: Record<string, string> }
