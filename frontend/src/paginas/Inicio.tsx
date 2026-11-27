import { Alert, Anchor, Badge, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { api, dataCurta, dataHora, tamanhoLegivel, type Eu, type Mina, type PainelDados } from "../api/cliente";

// Painel com números reais do banco (Etapa 4). Cada bloco só aparece se o usuário tiver acesso ao módulo.
export function Inicio({ usuario }: { usuario: Eu }) {
  const p = useQuery({ queryKey: ["painel"], queryFn: () => api<PainelDados>("/painel"), refetchInterval: 60000 });
  if (p.isLoading) return <Loader />;
  if (p.error || !p.data) return <Alert color="red">Não foi possível carregar o painel.</Alert>;
  const d = p.data;
  const totalUnidades = d.unidades_por_tipo?.reduce((s, c) => s + c.ativas, 0) ?? 0;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <Stack>
      <div>
        <Title order={3}>Olá, {usuario.nome}</Title>
        <Text size="sm" c="dimmed">
          {d.mina ?? "Nenhuma mina cadastrada"} · dados de {dataHora(d.gerado_em)}
        </Text>
      </div>

      {d.unidades_por_tipo !== null && d.mina === null && (
        <Alert color="blue">
          Comece cadastrando a mina em <Anchor component={Link} to="/estrutura">Estrutura da mina</Anchor>.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {d.unidades_por_tipo !== null && <Numero rotulo="Unidades ativas" valor={totalUnidades} para="/estrutura" />}
        {d.frentes !== null && <Numero rotulo="Frentes ativas" valor={d.frentes.ativa ?? 0} detalhe={d.frentes.paralisada ? `${d.frentes.paralisada} paralisada(s)` : undefined} />}
        {d.avancos_30_dias !== null && (
          <Numero rotulo="Avanço em 30 dias" valor={`${fmt(d.avancos_30_dias.metros)} m`} detalhe={`${d.avancos_30_dias.registros} registro(s)`} />
        )}
        {d.fichas !== null && (
          <Numero rotulo="Fichas de mapeamento" valor={Object.entries(d.fichas).filter(([e]) => e !== "cancelado").reduce((a, [, v]) => a + v, 0)}
            detalhe={d.fichas.submetido ? `${d.fichas.submetido} aguardando revisão` : "nenhuma aguardando revisão"} para="/mapeamento" />
        )}
        {d.amostras !== null && (
          <Numero rotulo="Amostras" valor={Object.entries(d.amostras).filter(([e]) => ["coletada", "enviada"].includes(e)).reduce((a, [, v]) => a + v, 0)}
            detalhe={`${d.amostras.aguardando_resultado ?? 0} aguardando resultado · ${d.amostras.com_resultado ?? 0} com resultado`} para="/amostras" />
        )}
        {d.arquivos !== null && <Numero rotulo="Arquivos originais" valor={d.arquivos.quantidade} detalhe={tamanhoLegivel(d.arquivos.bytes)} />}
        {d.usuarios_ativos !== null && <Numero rotulo="Usuários ativos" valor={d.usuarios_ativos} para="/usuarios" />}
      </SimpleGrid>

      {usuario.permissoes.includes("sondagem:ler") && <CartaoSondagem />}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {d.unidades_por_tipo !== null && (
          <Bloco titulo="Unidades por tipo">
            {d.unidades_por_tipo.length === 0 ? (
              <Text size="sm" c="dimmed">Nenhuma unidade cadastrada.</Text>
            ) : (
              <Table>
                <Table.Tbody>
                  {d.unidades_por_tipo.map((c) => (
                    <Table.Tr key={c.codigo}>
                      <Table.Td>
                        <Badge color={c.cor ?? "gray"} variant="light">{c.nome}</Badge>
                      </Table.Td>
                      <Table.Td ta="right" fw={600}>{c.ativas}</Table.Td>
                      <Table.Td c="dimmed" fz="xs">{c.inativas ? `+${c.inativas} inativa(s)` : ""}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Bloco>
        )}
        {d.ultimos_avancos !== null && (
          <Bloco titulo="Últimos avanços de frente">
            {d.ultimos_avancos.length === 0 ? (
              <Text size="sm" c="dimmed">Nenhum avanço registrado.</Text>
            ) : (
              <ScrollArea>
              <Table miw={420}>
                <Table.Tbody>
                  {d.ultimos_avancos.map((a, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{dataCurta(a.data)}</Table.Td>
                      <Table.Td fw={500}>{a.frente}</Table.Td>
                      <Table.Td>{a.avanco_m !== null ? `+${fmt(a.avanco_m)} m` : ""}</Table.Td>
                      <Table.Td c="dimmed" fz="xs">
                        {a.distancia_m !== null ? `${fmt(a.distancia_m)} m de ${a.referencia}` : ""}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              </ScrollArea>
            )}
          </Bloco>
        )}
      </SimpleGrid>

      <Bloco titulo="Atividades recentes" acao={usuario.permissoes.includes("auditoria:ler") ? <Anchor component={Link} to="/auditoria" size="sm">ver todas</Anchor> : undefined}>
        {d.atividades.length === 0 ? (
          <Text size="sm" c="dimmed">Nenhuma atividade registrada.</Text>
        ) : (
          <ScrollArea>
          <Table miw={520}>
            <Table.Tbody>
              {d.atividades.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td style={{ whiteSpace: "nowrap" }} fz="xs" c="dimmed">{dataHora(a.ocorrido_em)}</Table.Td>
                  <Table.Td>{a.tabela_nome} · {a.operacao_nome}</Table.Td>
                  <Table.Td fw={500}>{a.resumo}</Table.Td>
                  <Table.Td fz="xs">{a.usuario ?? ""}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </ScrollArea>
        )}
      </Bloco>
    </Stack>
  );
}

function Numero({ rotulo, valor, detalhe, para }: { rotulo: string; valor: number | string; detalhe?: string; para?: string }) {
  const conteudo = (
    <Paper withBorder p="md" h="100%">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{rotulo}</Text>
      <Text fz={28} fw={700} lh={1.2}>{valor}</Text>
      {detalhe && <Text size="xs" c="dimmed">{detalhe}</Text>}
    </Paper>
  );
  return para ? <Anchor component={Link} to={para} underline="never" c="inherit">{conteudo}</Anchor> : conteudo;
}

function Bloco({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{titulo}</Text>
        {acao}
      </Group>
      {children}
    </Paper>
  );
}

interface ResumoSondagem { exploratorios: number; ina: number; intervalos: number; amostras: number; com_quimica: number; fotos: number; metros: number }

/** Cartão da Sondagem: furos exploratórios e INA, trechos descritos, amostras, química e fotos. */
function CartaoSondagem() {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  const mina = minas.data?.[0];
  const r = useQuery({ queryKey: ["sondagem-resumo", mina?.id], queryFn: () => api<ResumoSondagem>(`/minas/${mina!.id}/sondagem/resumo`), enabled: !!mina });
  if (!r.data) return null;
  const d = r.data, fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Title order={5}>Sondagem: furos de sonda</Title>
        <Text size="xs" c="dimmed">{fmt(d.metros)} m perfurados</Text>
      </Group>
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs">
        <Numero rotulo="Exploratórios (F)" valor={d.exploratorios} para="/sondagem/furos" />
        <Numero rotulo="INA (água)" valor={d.ina} para="/sondagem/furos" />
        <Numero rotulo="Trechos descritos" valor={d.intervalos} para="/sondagem" />
        <Numero rotulo="Amostras" valor={d.amostras} para="/sondagem/amostragem" />
        <Numero rotulo="Com química" valor={d.com_quimica} para="/sondagem/amostragem" />
        <Numero rotulo="Fotos de testemunho" valor={d.fotos} para="/sondagem/fotos" />
      </SimpleGrid>
      <Group gap="md" mt="xs">
        <Anchor component={Link} to="/sondagem" size="sm">Perfil do furo</Anchor>
        <Anchor component={Link} to="/sondagem/amostragem" size="sm">Amostragem geoquímica</Anchor>
        <Anchor component={Link} to="/sondagem/fotos" size="sm">Fotos de testemunho</Anchor>
        <Anchor component={Link} to="/sondagem/tracks" size="sm">Tracks geoquímicos</Anchor>
      </Group>
    </Paper>
  );
}
