import { Alert, Anchor, Badge, Grid, Group, Stack, Table, Text } from "@mantine/core";
import { IconLayoutDashboard } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Carregando, Indicadores, Pagina, Painel, TabelaDados, Vazio, type Indicador } from "../componentes/ui";
import { api, dataCurta, dataHora, tamanhoLegivel, type Eu, type Mina, type PainelDados } from "../api/cliente";

// Painel com números reais do banco. Cada bloco só aparece se o usuário tiver acesso ao módulo.
export function Inicio({ usuario }: { usuario: Eu }) {
  const p = useQuery({ queryKey: ["painel"], queryFn: () => api<PainelDados>("/painel"), refetchInterval: 60000 });
  if (p.isLoading) return <Carregando texto="Carregando o painel…" />;
  if (p.error || !p.data) return <Alert color="red">Não foi possível carregar o painel.</Alert>;
  const d = p.data;
  const totalUnidades = d.unidades_por_tipo?.reduce((s, c) => s + c.ativas, 0) ?? 0;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const ind: Indicador[] = [];
  if (d.unidades_por_tipo !== null) ind.push({ rotulo: "Unidades ativas", valor: totalUnidades, para: "/estrutura" });
  if (d.frentes !== null) ind.push({ rotulo: "Frentes ativas", valor: d.frentes.ativa ?? 0, detalhe: d.frentes.paralisada ? `${d.frentes.paralisada} paralisada(s)` : undefined });
  if (d.avancos_30_dias !== null) ind.push({ rotulo: "Avanço em 30 dias", valor: `${fmt(d.avancos_30_dias.metros)} m`, detalhe: `${d.avancos_30_dias.registros} registro(s)` });
  if (d.fichas !== null) ind.push({ rotulo: "Fichas de mapeamento", valor: Object.entries(d.fichas).filter(([e]) => e !== "cancelado").reduce((a, [, v]) => a + v, 0), para: "/mapeamento",
    detalhe: d.fichas.submetido ? `${d.fichas.submetido} aguardando revisão` : "nenhuma aguardando revisão" });
  if (d.amostras !== null) ind.push({ rotulo: "Amostras", valor: Object.entries(d.amostras).filter(([e]) => ["coletada", "enviada"].includes(e)).reduce((a, [, v]) => a + v, 0), para: "/amostras",
    detalhe: `${d.amostras.aguardando_resultado ?? 0} aguardando · ${d.amostras.com_resultado ?? 0} com resultado` });
  if (d.arquivos !== null) ind.push({ rotulo: "Arquivos originais", valor: d.arquivos.quantidade, detalhe: tamanhoLegivel(d.arquivos.bytes), para: "/documentos" });
  if (d.usuarios_ativos !== null) ind.push({ rotulo: "Usuários ativos", valor: d.usuarios_ativos, para: "/usuarios" });
  const pendencias = [
    d.fichas?.submetido ? { texto: "Fichas de mapeamento aguardando revisão", n: d.fichas.submetido, para: "/mapeamento", cor: "orange" } : null,
    d.fichas?.rascunho ? { texto: "Fichas em rascunho", n: d.fichas.rascunho, para: "/mapeamento", cor: "gray" } : null,
    d.amostras?.aguardando_resultado ? { texto: "Amostras aguardando resultado do laboratório", n: d.amostras.aguardando_resultado, para: "/amostras", cor: "red" } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <Pagina titulo="Painel" icone={<IconLayoutDashboard size={20} />}
      subtitulo={`Olá, ${usuario.nome} · ${d.mina ?? "nenhuma mina cadastrada"} · dados de ${dataHora(d.gerado_em)}`}>
      {d.unidades_por_tipo !== null && d.mina === null && (
        <Alert color="blue">Comece cadastrando a mina em <Anchor component={Link} to="/estrutura">Estrutura da mina</Anchor>.</Alert>
      )}
      {ind.length > 0 && <Indicadores itens={ind} />}
      <Grid gutter={10}>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap={10}>
            {usuario.permissoes.includes("sondagem:ler") && <CartaoSondagem />}
            <Painel titulo="Atividades recentes" p={0} acoes={usuario.permissoes.includes("auditoria:ler") ? <Anchor component={Link} to="/auditoria" size="xs">ver histórico completo</Anchor> : undefined}>
              <TabelaDados dados={d.atividades} chave={(a) => String(a.id)} alturaMax={340} minLargura={560}
                vazio={<Vazio compacto titulo="Nenhuma atividade registrada." />}
                colunas={[
                  { chave: "ocorrido_em", titulo: "Quando", largura: 140, render: (a) => <Text size="xs" c="dimmed">{dataHora(a.ocorrido_em)}</Text> },
                  { chave: "tabela", titulo: "Registro", valor: (a) => `${a.tabela_nome} · ${a.operacao_nome}` },
                  { chave: "resumo", titulo: "Identificação", render: (a) => <Text size="sm" fw={500}>{a.resumo}</Text>, valor: (a) => a.resumo },
                  { chave: "usuario", titulo: "Usuário", valor: (a) => a.usuario ?? "" },
                ]} />
            </Painel>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap={10}>
            <Painel titulo="Pendências">
              {pendencias.length ? (
                <Stack gap={4}>
                  {pendencias.map((x) => (
                    <Anchor key={x.texto} component={Link} to={x.para} underline="never" c="inherit">
                      <Group justify="space-between" wrap="nowrap" py={3}>
                        <Text size="sm">{x.texto}</Text>
                        <Badge color={x.cor} variant="filled">{x.n}</Badge>
                      </Group>
                    </Anchor>
                  ))}
                </Stack>
              ) : <Text size="sm" c="dimmed">Nada pendente.</Text>}
            </Painel>
            {d.unidades_por_tipo !== null && (
              <Painel titulo="Unidades por tipo" p={0}>
                {d.unidades_por_tipo.length === 0 ? <Vazio compacto titulo="Nenhuma unidade cadastrada." /> : (
                  <Table>
                    <Table.Tbody>
                      {d.unidades_por_tipo.map((c) => (
                        <Table.Tr key={c.codigo}>
                          <Table.Td><Badge color={c.cor ?? "gray"}>{c.nome}</Badge></Table.Td>
                          <Table.Td className="gm-num" fw={600}>{c.ativas}</Table.Td>
                          <Table.Td c="dimmed" fz="xs">{c.inativas ? `+${c.inativas} inativa(s)` : ""}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Painel>
            )}
            {d.ultimos_avancos !== null && (
              <Painel titulo="Últimos avanços de frente" p={0}>
                {d.ultimos_avancos.length === 0 ? <Vazio compacto titulo="Nenhum avanço registrado." /> : (
                  <Table>
                    <Table.Tbody>
                      {d.ultimos_avancos.map((a, i) => (
                        <Table.Tr key={i}>
                          <Table.Td fz="xs">{dataCurta(a.data)}</Table.Td>
                          <Table.Td fw={500}>{a.frente}</Table.Td>
                          <Table.Td className="gm-num">{a.avanco_m !== null ? `+${fmt(a.avanco_m)} m` : ""}</Table.Td>
                          <Table.Td c="dimmed" fz="xs">{a.distancia_m !== null ? `${fmt(a.distancia_m)} m de ${a.referencia}` : ""}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Painel>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Pagina>
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
    <Painel titulo="Sondagem: furos de sonda" descricao={`${fmt(d.metros)} m perfurados`}
      acoes={<Group gap={10}>
        <Anchor component={Link} to="/sondagem" size="xs">Perfil do furo</Anchor>
        <Anchor component={Link} to="/sondagem/amostragem" size="xs">Amostragem geoquímica</Anchor>
        <Anchor component={Link} to="/sondagem/fotos" size="xs">Fotos de testemunho</Anchor>
        <Anchor component={Link} to="/sondagem/tracks" size="xs">Tracks geoquímicos</Anchor>
      </Group>}>
      <Indicadores itens={[
        { rotulo: "Exploratórios (F)", valor: d.exploratorios, para: "/sondagem/furos" },
        { rotulo: "INA (água)", valor: d.ina, para: "/sondagem/furos" },
        { rotulo: "Trechos descritos", valor: d.intervalos, para: "/sondagem" },
        { rotulo: "Amostras", valor: d.amostras, para: "/sondagem/amostragem" },
        { rotulo: "Com química", valor: d.com_quimica, para: "/sondagem/amostragem" },
        { rotulo: "Fotos de testemunho", valor: d.fotos, para: "/sondagem/fotos" },
      ]} />
    </Painel>
  );
}
