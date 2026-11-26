/** Tipos da série da galeria (resposta de /unidades/{id}/longitudinal) usados pelos tracks. */

interface TermoRef { id: string; nome: string; cor: string | null }
export interface Valor { y: number | null; texto: string; situacao: "medido" | "abaixo_ld" | "acima_ld" | "sem_valor" | "omitido"; unidade: string; certificado: string }
export interface AmostraSerie {
  id: string; codigo: string; chainage_m: number; ponto: number; x: number; y: number; z: number | null; data: string | null;
  responsavel: string | null; responsavel_id: string | null; litologia: TermoRef | null; secao_de_m: number | null; secao_ate_m: number | null;
  valores: Record<string, Valor>;
}
interface Serie { chave: string; analito: string; unidade: string | null; pontos: number; abaixo_ld?: number; acima_ld?: number; sem_valor?: number; omitido?: number }
interface Referencia { tipo: "eixo" | "amostras"; inicio: string; invertido: boolean; percurso: number[][]; pontos: number; saltos: { depois_de: string; trecho_m: number }[]; irregular: { caminho_m: number; entre_pontas_m: number } | null }
export interface Dados { unidade: { id: string; codigo: string; nome: string }; referencia: Referencia; regra_ld_descricao: string; series: Serie[]; avisos: string[]; amostras: AmostraSerie[]; sem_posicao: { codigo: string; motivo: string }[] }
export const valorCor = (v?: Valor) => (v && v.y != null ? v.y : null);
