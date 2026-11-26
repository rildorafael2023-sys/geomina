/** Tracks da análise de galerias: configuração (salva nos layouts) e valores padrão. */
import type { Metodo } from "../../../geologia/classes";

export type TipoGeo = "amostras" | "litologia" | "alteracao" | "mineralizacao" | "estruturas" | "descricao" | "fotos";
export type Representacao = "faixa" | "barras" | "pontos";
export type Altura = "P" | "M" | "G";

export interface TrackAnalito {
  id: string; tipo: "analito"; analito: string; representacao: Representacao; escala: "linear" | "log";
  min: string; max: string; metodo: Metodo; classes: number; limites: string; paleta: string; altura: Altura; valores: boolean; ligar: boolean;
}
export interface TrackGeo { id: string; tipo: TipoGeo; altura: Altura }
export type Track = TrackAnalito | TrackGeo;

export const NOME_GEO: Record<TipoGeo, string> = {
  amostras: "Amostras", litologia: "Litologia", alteracao: "Alteração", mineralizacao: "Mineralização",
  estruturas: "Estruturas", descricao: "Descrição", fotos: "Fotos e croquis",
};

export const ALTURA_PX: Record<Altura, number> = { P: 26, M: 40, G: 72 };

let n = 0;
const novoId = () => `t${Date.now().toString(36)}${(n++).toString(36)}`;

export function trackAnalito(analito: string): TrackAnalito {
  return { id: novoId(), tipo: "analito", analito, representacao: "faixa", escala: "linear", min: "", max: "", metodo: "quantis",
    classes: 5, limites: "", paleta: "teor", altura: "M", valores: true, ligar: false };
}
export function trackGeo(tipo: TipoGeo): TrackGeo {
  return { id: novoId(), tipo, altura: tipo === "descricao" || tipo === "estruturas" ? "G" : "P" };
}
export const TRACKS_PADRAO = (): Track[] => [trackGeo("amostras"), trackGeo("litologia")];
