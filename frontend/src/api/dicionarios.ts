import { useQuery } from "@tanstack/react-query";

import { api, type Dicionario, type Termo } from "./cliente";

export function useDicionarios() {
  const q = useQuery({ queryKey: ["dicionarios"], queryFn: () => api<Dicionario[]>("/dicionarios"), staleTime: 60000 });
  const porCodigo = new Map((q.data ?? []).map((d) => [d.codigo, d]));
  const porId = new Map<string, Termo>();
  for (const d of q.data ?? []) for (const t of d.termos) porId.set(t.id, t);
  /** Opções para Select: só termos ativos, mais o valor atual (mesmo inativo) para não sumir de registros antigos. */
  const opcoes = (codigo: string, atual?: string | null) =>
    (porCodigo.get(codigo)?.termos ?? [])
      .filter((t) => t.ativo || t.id === atual)
      .map((t) => ({ value: t.id, label: t.sigla ? `${t.nome} (${t.sigla})` : t.nome }));
  return { ...q, porCodigo, porId, opcoes };
}
