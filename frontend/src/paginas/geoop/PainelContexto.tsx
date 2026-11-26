import { ActionIcon, Badge, Button, Group, Loader, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { api, ErroApi, type Eu, type Mina } from "../../api/cliente";
import { PainelDocumentos } from "../documentos/PainelDocumentos";
import { useGeo, type Registro } from "./estado";

interface Detalhe extends Registro {
  resultados: { analito: string; tipo_analito: string; metodo: string; certificado: string; tipo_linha: string; valor: string; unidade: string; qualificador: string; preferido: boolean }[];
}

/** Painel de contexto da seleção: identificação, local, geologia, TODOS os resultados do laudo, fotos e croquis. */
export function PainelContexto({ mina, eu, chave }: { mina: Mina; eu: Eu; chave: string }) {
  const set = useGeo((s) => s.set);
  const q = useQuery({ queryKey: ["geoop-registro", mina.id, chave], queryFn: () => api<Detalhe>(`/minas/${mina.id}/geoop/registros/${encodeURIComponent(chave)}`) });
  const d = q.data;
  useEffect(() => { if (d && d.chave !== chave) set({ selecionado: d.chave }); }, [d, chave, set]);
  const linha = (r: string, v: React.ReactNode) => (v === null || v === undefined || v === "" ? null : (
    <Group gap={6} wrap="nowrap" align="flex-start"><Text size="xs" c="dimmed" w={96} style={{ flexShrink: 0 }}>{r}</Text><Text size="xs">{v}</Text></Group>
  ));
  const grupos = new Map<string, Detalhe["resultados"]>();
  for (const r of d?.resultados ?? []) grupos.set(r.tipo_analito, [...(grupos.get(r.tipo_analito) ?? []), r]);
  return (
    <aside data-testid="painel-contexto" style={{ borderLeft: "1px solid var(--mantine-color-gray-3)", display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
      <Group px="sm" py={6} justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }} wrap="nowrap">
        <Text fw={700} size="sm">{d?.codigo ?? "…"}</Text>
        <ActionIcon variant="subtle" onClick={() => set({ selecionado: null })} aria-label="Fechar painel">✕</ActionIcon>
      </Group>
      {q.error ? <Text m="sm" size="sm" c="red">{q.error instanceof ErroApi ? q.error.message : String(q.error)}</Text> : !d ? <Loader m="md" size="sm" /> : (
        <ScrollArea style={{ flex: 1 }} type="auto">
          <Stack gap={8} p="sm">
            <Group gap={4}>
              <Badge size="sm" color={d.cadastrada ? "teal" : "orange"} variant="light">{d.cadastrada ? "cadastrada" : "só no laudo"}</Badge>
              <Badge size="sm" variant="outline">{d.serie}</Badge>
              <Badge size="sm" variant="outline" color="gray">{{ com_resultado: "com resultado", aguardando: "aguardando laudo", sem_envio: "não enviada", so_laudo: "resultado sem cadastro", cancelada: "cancelada" }[d.status]}</Badge>
            </Group>
            {!d.cadastrada && <Text size="xs" c="orange.8">Este código aparece no laudo mas não está no cadastro de amostras. Os resultados já podem ser usados; local e geologia ficam vazios até cadastrar (aba Consulta → Conciliar).</Text>}
            <Stack gap={2}>
              {linha("Nível", d.nivel?.codigo)}
              {linha("Galeria", d.galeria ? `${d.galeria.codigo} — ${d.galeria.nome}` : null)}
              {linha("Trecho", d.trecho?.codigo)}
              {linha("Local escrito", d.local)}
              {linha("Coordenadas", d.x != null ? `E ${d.x.toFixed(2)}  N ${d.y?.toFixed(2)}  Z ${d.z?.toFixed(2) ?? "—"}  (EPSG:${d.srid})` : d.cadastrada ? "não informadas" : null)}
              {linha("Seção (parede)", d.secao_de_m != null ? `${d.secao_de_m} – ${d.secao_ate_m} m` : null)}
              {linha("Furo", d.furo ? `${d.furo}${d.prof_de_m != null ? ` · ${d.prof_de_m}–${d.prof_ate_m} m` : ""}` : null)}
              {linha("Coleta", d.data ? new Date(d.data + "T00:00").toLocaleDateString("pt-BR") : null)}
              {linha("Responsável", d.responsavel?.nome)}
              {linha("Campanha", d.campanha?.codigo)}
              {linha("Tipo", d.tipo?.nome)}
              {linha("Litologia", d.litologia ? <><span style={{ display: "inline-block", width: 9, height: 9, background: d.litologia.cor ?? "#ccc", marginRight: 4 }} />{d.litologia.nome}</> : null)}
              {linha("Alteração", d.alteracao?.nome)}
              {linha("Mineralização", d.mineralizacao?.nome)}
              {linha("Descrição", d.descricao)}
              {linha("Ficha", d.ficha ? <Link to={`/mapeamento/${d.ficha.id}`}>{d.ficha.numero}</Link> : null)}
              {linha("Laboratório", Object.values(d.laboratorios).join(", "))}
              {linha("Certificados", Object.values(d.certificados).join(", "))}
            </Stack>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" mt={4}>Resultados do laudo ({d.resultados.length})</Text>
            {[...grupos.entries()].map(([tipo, rs]) => {
              // uma linha por analito/método/certificado: amostra, duplicata e replicata do laboratório lado a lado
              const linhas = new Map<string, { analito: string; unidade: string; certificado: string; smp?: typeof rs[number]; dup?: string; rep?: string }>();
              for (const r of rs) {
                const k = `${r.analito}|${r.metodo}|${r.certificado}`;
                const l = linhas.get(k) ?? { analito: r.analito, unidade: r.unidade, certificado: r.certificado };
                if (r.tipo_linha === "SMP") l.smp = r; else if (r.tipo_linha === "DUP") l.dup = r.valor; else if (r.tipo_linha === "REP") l.rep = r.valor;
                linhas.set(k, l);
              }
              const temDup = [...linhas.values()].some((l) => l.dup), temRep = [...linhas.values()].some((l) => l.rep);
              const certs = new Set([...linhas.values()].map((l) => l.certificado));
              return (
                <div key={tipo}>
                  <Text size="xs" fw={600} c="dimmed">{tipo === "oxido" ? "Óxidos" : tipo === "elemento" ? "Elementos" : "Outros parâmetros"}</Text>
                  <Table fz={11} verticalSpacing={0} horizontalSpacing={4} withRowBorders={false} striped data-testid={`resultados-${tipo}`}>
                    <Table.Thead><Table.Tr><Table.Th /><Table.Th ta="right">Valor</Table.Th><Table.Th />{temDup && <Table.Th ta="right">Dup. lab.</Table.Th>}{temRep && <Table.Th ta="right">Rep. lab.</Table.Th>}{certs.size > 1 && <Table.Th>Certificado</Table.Th>}</Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {[...linhas.values()].map((l, i) => {
                        const subst = l.smp && !l.smp.preferido && d.cadastrada;
                        return (
                          <Table.Tr key={i} opacity={subst ? 0.5 : 1} title={subst ? "Substituído por reanálise mais recente" : undefined}>
                            <Table.Td fw={600} w={54}>{l.analito}</Table.Td>
                            <Table.Td ta="right">{l.smp?.valor ?? "—"}</Table.Td>
                            <Table.Td c="dimmed">{l.unidade}</Table.Td>
                            {temDup && <Table.Td ta="right" c="dimmed">{l.dup ?? ""}</Table.Td>}
                            {temRep && <Table.Td ta="right" c="dimmed">{l.rep ?? ""}</Table.Td>}
                            {certs.size > 1 && <Table.Td c="dimmed">{l.certificado}</Table.Td>}
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </div>
              );
            })}
            {!d.resultados.length && <Text size="xs" c="dimmed">Sem resultados de laboratório.</Text>}
            {d.ficha && eu.permissoes.includes("arquivo:ler") && (
              <>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" mt={4}>Fotos e croquis da ficha</Text>
                <PainelDocumentos minaId={mina.id} mapeamentoId={d.ficha.id} podeEnviar={false} compacto />
              </>
            )}
            {d.amostra_id && <Button component={Link} to="/amostras" size="compact-xs" variant="light" w="fit-content">Abrir no cadastro de amostras</Button>}
          </Stack>
        </ScrollArea>
      )}
    </aside>
  );
}
