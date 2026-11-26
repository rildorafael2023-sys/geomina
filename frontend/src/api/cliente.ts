// Cliente da API local do GeoMina. Toda comunicação é com 127.0.0.1 (este computador).

const CHAVE_TOKEN = "geomina.token";

export class ErroApi extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
    public detalhes?: unknown,
  ) {
    super(mensagem);
  }
}

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function gravarToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN, token);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    /* armazenamento indisponível: a sessão dura só enquanto a página estiver aberta */
  }
}

let tokenMemoria: string | null = lerToken();
let aoExpirar: (() => void) | null = null;

export function definirToken(token: string | null) {
  tokenMemoria = token;
  gravarToken(token);
}

export function aoSessaoExpirar(fn: () => void) {
  aoExpirar = fn;
}

export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const cabecalhos = new Headers(opcoes.headers);
  if (tokenMemoria) cabecalhos.set("Authorization", `Bearer ${tokenMemoria}`);
  if (opcoes.body && !(opcoes.body instanceof FormData)) cabecalhos.set("Content-Type", "application/json");
  const r = await fetch(`/api/v1${caminho}`, { ...opcoes, headers: cabecalhos });
  if (r.status === 204) return undefined as T;
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && tokenMemoria && caminho !== "/auth/login") {
      definirToken(null);
      aoExpirar?.();
    }
    let msg = corpo.mensagem ?? `Erro ${r.status}`;
    if (corpo.codigo === "validacao" && Array.isArray(corpo.detalhes)) {
      msg += " " + corpo.detalhes.map((d: { campo: string; motivo: string }) => `${d.campo}: ${d.motivo}`).join("; ");
    }
    throw new ErroApi(r.status, corpo.codigo ?? "erro", msg, corpo.detalhes);
  }
  return corpo as T;
}

export const json = (dados: unknown) => JSON.stringify(dados);

// ---- Tipos (espelham os esquemas do backend) ----
export interface Papel {
  codigo: string;
  nome: string;
}
export interface Usuario {
  id: string;
  login: string;
  nome: string;
  email: string | null;
  ativo: boolean;
  trocar_senha: boolean;
  ultimo_acesso: string | null;
  versao: number;
  papeis: Papel[];
}
export interface Eu extends Usuario {
  permissoes: string[];
}
export interface RespostaLogin {
  token: string;
  expira_em: string;
  usuario: Eu;
}
export interface Saude {
  status: string;
  versao_app: string;
  revisao_banco: string;
  sqlite: string;
  rtree: boolean;
  proj: string;
  crs_disponiveis: Record<string, boolean>;
  pasta_dados: string;
  modo: string;
}

// ---- Estrutura da mina (Etapa 3) ----
export type StatusUnidade = "ativa" | "paralisada" | "encerrada";
export interface Mina {
  id: string;
  codigo: string;
  nome: string;
  srid_trabalho: number;
  crs_nome: string | null;
  declinacao_magnetica: number | null;
  observacoes: string | null;
  ativo: boolean;
  versao: number;
}
export interface TipoUnidade {
  id: string;
  codigo: string;
  nome: string;
  pode_ser_raiz: boolean;
  possui_eixo: boolean;
  multinivel: boolean;
  e_nivel: boolean;
  e_frente: boolean;
  cor: string | null;
  ordem: number;
  ativo: boolean;
  versao: number;
  filhos_permitidos: string[];
}
export interface UnidadeResumo {
  id: string;
  mina_id: string;
  pai_id: string | null;
  tipo: string;
  tipo_nome: string;
  codigo: string;
  nome: string;
  status: StatusUnidade;
  ativo: boolean;
  versao: number;
}
export interface UnidadeDetalhe extends UnidadeResumo {
  cota_referencia: number | null;
  descricao: string | null;
  caminho_nomes: string[];
  niveis: UnidadeResumo[];
  filhos: number;
  criado_em: string;
  atualizado_em: string | null;
}
export interface Avanco {
  id: string;
  frente_id: string;
  data: string;
  distancia_m: number | null;
  referencia: string | null;
  avanco_m: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  observacao: string | null;
  versao: number;
  criado_em: string;
}
export interface EventoHistorico {
  ocorrido_em: string;
  tabela: string;
  operacao: string;
  descricao: string;
  usuario: string | null;
}

export const CRS_OPCOES = [
  { value: "31983", label: "SIRGAS 2000 / UTM 23S (EPSG:31983)" },
  { value: "29193", label: "SAD69 / UTM 23S (EPSG:29193)" },
];

export const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");
export const dataCurta = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");

// ---- Painel, auditoria e backup (Etapa 4) ----
export interface Atividade {
  id: number;
  ocorrido_em: string;
  tabela: string;
  tabela_nome: string;
  operacao: string;
  operacao_nome: string;
  resumo: string;
  usuario: string | null;
}
export interface ItemAuditoria extends Atividade {
  registro_id: string;
  origem: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}
export interface PainelDados {
  gerado_em: string;
  mina: string | null;
  unidades_por_tipo: { codigo: string; nome: string; cor: string | null; ativas: number; inativas: number }[] | null;
  frentes: Record<string, number> | null;
  avancos_30_dias: { registros: number; metros: number } | null;
  ultimos_avancos:
    | { frente_id: string; frente: string; data: string; distancia_m: number | null; referencia: string | null; avanco_m: number | null; responsavel: string | null }[]
    | null;
  atividades: Atividade[];
  arquivos: { quantidade: number; bytes: number } | null;
  usuarios_ativos: number | null;
  fichas: Record<string, number> | null;
}
export interface Backup {
  nome: string;
  tipo: string;
  criado_em: string;
  tamanho: number;
  versao_app: string | null;
  revisao_banco: string | null;
  com_arquivos: boolean;
  usuario: string | null;
}

export function tamanhoLegivel(bytes: number): string {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

/** Baixa um arquivo da API autenticada (o token vai no cabeçalho, não na URL). */
export async function baixar(caminho: string, nome: string): Promise<void> {
  const r = await fetch(`/api/v1${caminho}`, { headers: { Authorization: `Bearer ${tokenMemoria ?? ""}` } });
  if (!r.ok) throw new ErroApi(r.status, "download", "Falha ao baixar o arquivo.");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Dicionários e mapeamento (Etapa 5) ----
export interface Termo {
  id: string;
  codigo: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  cor: string | null;
  classe: "planar" | "linear" | null;
  ordem: number;
  ativo: boolean;
  versao: number;
  sinonimos: string[];
}
export interface Dicionario {
  codigo: string;
  nome: string;
  descricao: string | null;
  termos: Termo[];
}
export type EstadoFicha = "rascunho" | "submetido" | "aprovado" | "cancelado";
export interface IntervaloFicha {
  id?: string;
  de_m: number;
  ate_m: number;
  litologia_id: string;
  textura_id: string | null;
  granulacao: string | null;
  cor: string | null;
  alteracao_id: string | null;
  intensidade_id: string | null;
  mineralizacao_id: string | null;
  minerais: string | null;
  percentual: number | null;
  contato_id: string | null;
  descricao: string | null;
}
export interface MedidaFicha {
  id: string;
  tipo_id: string;
  classe: "planar" | "linear";
  dip_dir: number | null;
  dip: number | null;
  trend: number | null;
  plunge: number | null;
  convencao: string;
  valor_digitado: { a: number; b: number; convencao: string } | null;
  familia: string | null;
  espessura_m: number | null;
  preenchimento: string | null;
  movimento: string | null;
  intervalo_id: string | null;
  observacao: string | null;
}
export interface AmostraFicha {
  id?: string;
  codigo: string;
  tipo: string | null;
  de_m: number | null;
  ate_m: number | null;
  destino_id: string | null;
  leitura_campo: string | null;
  observacao: string | null;
}
export interface Ficha {
  id: string;
  mina_id: string;
  numero: string;
  unidade_id: string;
  unidade: string;
  unidade_caminho: string[];
  data: string;
  hora: string | null;
  geologo_id: string;
  geologo: string;
  acompanhantes: string | null;
  exposicao_id: string | null;
  distancia_m: number | null;
  referencia: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  crs: string | null;
  azimute_eixo: number | null;
  largura_m: number | null;
  altura_m: number | null;
  norte_referencia: "magnetico" | "quadricula" | "verdadeiro";
  declinacao: number | null;
  descricao: string | null;
  agua_id: string | null;
  obs_geotecnicas: string | null;
  estado: EstadoFicha;
  revisao: number;
  versao: number;
  submetido_em: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
  motivo: string | null;
  criado_em: string;
  atualizado_em: string | null;
  intervalos: (IntervaloFicha & { id: string })[];
  medidas: MedidaFicha[];
  amostras: (AmostraFicha & { id: string })[];
  termos: Record<string, { id: string; codigo: string; nome: string; sigla: string | null; cor: string | null }>;
  avisos: string[];
  pode_editar: boolean;
  pode_aprovar: boolean;
}
export interface FichaResumo {
  id: string;
  numero: string;
  data: string;
  unidade_id: string;
  unidade: string;
  geologo: string;
  estado: EstadoFicha;
  revisao: number;
  litologias: string[];
  medidas: number;
  amostras: number;
}
export const ESTADOS_FICHA: Record<EstadoFicha, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "gray" },
  submetido: { rotulo: "Aguardando revisão", cor: "yellow" },
  aprovado: { rotulo: "Aprovada", cor: "teal" },
  cancelado: { rotulo: "Cancelada", cor: "red" },
};
