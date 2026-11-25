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
