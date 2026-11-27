import { Alert, Badge, Button, Group, Loader, Paper, ScrollArea, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, baixar, ESTADOS_FICHA, type Eu, type Mina, type UnidadeResumo } from "../api/cliente";
import { useDicionarios } from "../api/dicionarios";
import { IconReportAnalytics } from "@tabler/icons-react";
import { Pagina } from "../componentes/ui";

interface Mes { mes: string; rotulo: string; fichas: number; fichas_aprovadas: number; amostras: number; amostras_com_resultado: number; certificados: number; resultados: number }
interface Producao {
  meses: Mes[];
  total: Omit<Mes, "mes" | "rotulo">;
  geologos: { nome: string; fichas: number; amostras: number }[];
  estados_fichas: Record<string, number>;
  pendencias: { amostras_sem_resultado?: number; fichas_rascunho?: number; fichas_aguardando_revisao?: number };
  amostras_sem_data: number;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const inicioDoAno = () => `${new Date().getFullYear()}-01-01`;
const br = (d: string) => (d ? d.split("-").reverse().join("/") : "");

async function tentar(acao: () => Promise<void>) {
  try {
    await acao();
  } catch {
    notifications.show({ color: "red", message: "Não foi possível gerar o arquivo." });
  }
}

export function Relatorios({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina em "Estrutura da mina" antes de gerar relatórios.</Alert>;
  const pode = (p: string) => eu.permissoes.includes(p);
  return (
    <Pagina titulo="Relatórios" icone={<IconReportAnalytics size={20} />} subtitulo={<>Planilhas e relatórios gerados a partir dos dados do GeoMina, com os filtros escolhidos. Cada planilha tem uma aba "Metadados" com a data, o usuário e os filtros.</>}>
      <Tabs defaultValue={pode("amostra:ler") ? "producao" : "fichas"} keepMounted={false}>
        <Tabs.List className="nao-imprimir">
          {pode("mapeamento:ler") && pode("amostra:ler") && <Tabs.Tab value="producao">Produção por período</Tabs.Tab>}
          {pode("mapeamento:ler") && <Tabs.Tab value="fichas">Fichas de mapeamento</Tabs.Tab>}
          {pode("geoquimica:ler") && <Tabs.Tab value="geoquimica">Geoquímica</Tabs.Tab>}
          {pode("auditoria:ler") && <Tabs.Tab value="historico">Histórico de alterações</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="producao" pt="md"><RelProducao mina={mina} /></Tabs.Panel>
        <Tabs.Panel value="fichas" pt="md"><RelFichas mina={mina} /></Tabs.Panel>
        <Tabs.Panel value="geoquimica" pt="md"><RelGeoquimica mina={mina} /></Tabs.Panel>
        <Tabs.Panel value="historico" pt="md"><RelHistorico /></Tabs.Panel>
      </Tabs>
    </Pagina>
  );
}

function Barra({ v, max, cor }: { v: number; max: number; cor: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <div style={{ width: 70, height: 8, background: "var(--mantine-color-gray-1)", borderRadius: 2 }}>
        <div style={{ width: `${max ? (100 * v) / max : 0}%`, height: 8, background: cor, borderRadius: 2 }} />
      </div>
      <Text size="sm" w={44} ta="right">{v.toLocaleString("pt-BR")}</Text>
    </Group>
  );
}

function RelProducao({ mina }: { mina: Mina }) {
  const [de, setDe] = useState(inicioDoAno());
  const [ate, setAte] = useState(hoje());
  const p = new URLSearchParams();
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  const q = useQuery({ queryKey: ["rel-producao", mina.id, p.toString()], queryFn: () => api<Producao>(`/minas/${mina.id}/relatorios/producao?${p}`) });
  const d = q.data;
  const max = (k: keyof Mes) => Math.max(0, ...(d?.meses ?? []).map((m) => m[k] as number));
  return (
    <Stack data-testid="rel-producao">
      <Paper withBorder p="sm" className="nao-imprimir">
        <Group align="end">
          <TextInput type="date" label="De" value={de} onChange={(e) => setDe(e.currentTarget.value)} />
          <TextInput type="date" label="Até" value={ate} onChange={(e) => setAte(e.currentTarget.value)} />
          <Button variant="default" onClick={() => tentar(() => baixar(`/minas/${mina.id}/relatorios/producao.xlsx?${p}`, "producao.xlsx"))}>Planilha Excel</Button>
          <Button variant="default" onClick={() => window.print()}>Imprimir / salvar PDF</Button>
        </Group>
      </Paper>
      <div>
        <Title order={4}>Produção — {mina.codigo}</Title>
        <Text size="sm" c="dimmed">Período: {de ? br(de) : "início"} a {ate ? br(ate) : "hoje"}. Datas usadas: ficha = data do mapeamento; amostra = data de coleta; laudo = emissão do certificado.</Text>
      </div>
      {q.isLoading || !d ? <Loader size="sm" /> : (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            {[["Fichas", d.total.fichas], ["Amostras coletadas", d.total.amostras], ["Certificados recebidos", d.total.certificados], ["Resultados de amostras", d.total.resultados]].map(([r, v]) => (
              <Paper key={r} withBorder p="sm"><Text size="xs" c="dimmed">{r}</Text><Text fw={700} size="xl">{Number(v).toLocaleString("pt-BR")}</Text></Paper>
            ))}
          </SimpleGrid>
          {d.meses.length === 0 ? <Text size="sm" c="dimmed">Nada registrado no período.</Text> : (
            <ScrollArea>
              <Table striped miw={760} data-testid="tabela-meses">
                <Table.Thead><Table.Tr>
                  <Table.Th>Mês</Table.Th><Table.Th>Fichas</Table.Th><Table.Th>Aprovadas</Table.Th><Table.Th>Amostras</Table.Th>
                  <Table.Th>Com resultado</Table.Th><Table.Th>Certificados</Table.Th><Table.Th>Resultados</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {d.meses.map((m) => (
                    <Table.Tr key={m.mes}>
                      <Table.Td fw={500}>{m.rotulo}</Table.Td>
                      <Table.Td><Barra v={m.fichas} max={max("fichas")} cor="var(--mantine-color-teal-6)" /></Table.Td>
                      <Table.Td>{m.fichas_aprovadas}</Table.Td>
                      <Table.Td><Barra v={m.amostras} max={max("amostras")} cor="var(--mantine-color-blue-6)" /></Table.Td>
                      <Table.Td>{m.amostras_com_resultado}{m.amostras ? ` (${Math.round((100 * m.amostras_com_resultado) / m.amostras)}%)` : ""}</Table.Td>
                      <Table.Td>{m.certificados}</Table.Td>
                      <Table.Td>{m.resultados.toLocaleString("pt-BR")}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Paper withBorder p="sm">
              <Text fw={600} mb={4}>Por geólogo / responsável</Text>
              <Table data-testid="tabela-geologos">
                <Table.Thead><Table.Tr><Table.Th>Nome</Table.Th><Table.Th>Fichas</Table.Th><Table.Th>Amostras</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{d.geologos.map((g) => <Table.Tr key={g.nome}><Table.Td>{g.nome}</Table.Td><Table.Td>{g.fichas}</Table.Td><Table.Td>{g.amostras}</Table.Td></Table.Tr>)}</Table.Tbody>
              </Table>
            </Paper>
            <Paper withBorder p="sm" data-testid="pendencias">
              <Text fw={600} mb={4}>Pendências atuais (todo o período)</Text>
              <Stack gap={4}>
                <Group justify="space-between"><Text size="sm">Fichas em rascunho</Text><Badge color="gray">{d.pendencias.fichas_rascunho ?? 0}</Badge></Group>
                <Group justify="space-between"><Text size="sm">Fichas aguardando revisão</Text><Badge color="orange">{d.pendencias.fichas_aguardando_revisao ?? 0}</Badge></Group>
                <Group justify="space-between"><Text size="sm">Amostras sem resultado de laboratório</Text><Badge color="red">{d.pendencias.amostras_sem_resultado ?? 0}</Badge></Group>
                {d.amostras_sem_data > 0 && <Text size="xs" c="dimmed">{d.amostras_sem_data} amostra(s) sem data de coleta não entram na contagem por mês.</Text>}
              </Stack>
            </Paper>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

function RelFichas({ mina }: { mina: Mina }) {
  const dic = useDicionarios();
  const [f, setF] = useState({ unidade: null as string | null, estado: null as string | null, litologia: null as string | null, de: "", ate: "", texto: "" });
  const [tabela, setTabela] = useState<string>("fichas");
  const unidades = useQuery({ queryKey: ["unidades", mina.id, true], queryFn: () => api<UnidadeResumo[]>(`/minas/${mina.id}/unidades?incluir_inativas=true`) });
  const p = new URLSearchParams();
  if (f.unidade) p.set("unidade_id", f.unidade);
  if (f.estado) p.set("estado", f.estado);
  if (f.litologia) p.set("litologia_id", f.litologia);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (f.texto.trim()) p.set("texto", f.texto.trim());
  const n = useQuery({ queryKey: ["fichas", mina.id, p.toString()], queryFn: () => api<unknown[]>(`/minas/${mina.id}/mapeamentos?${p}`) });
  const pt = new URLSearchParams(p);
  pt.set("tabela", tabela);
  return (
    <Stack data-testid="rel-fichas">
      <Paper withBorder p="sm">
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
          <Select label="Local (inclui o que está dentro)" clearable searchable value={f.unidade} onChange={(v) => setF({ ...f, unidade: v })}
            data={(unidades.data ?? []).map((u) => ({ value: u.id, label: `${u.codigo} (${u.tipo_nome})` }))} />
          <Select label="Situação" clearable value={f.estado} onChange={(v) => setF({ ...f, estado: v })}
            data={Object.entries(ESTADOS_FICHA).map(([v, e]) => ({ value: v, label: e.rotulo }))} />
          <Select label="Litologia" clearable searchable value={f.litologia} onChange={(v) => setF({ ...f, litologia: v })} data={dic.opcoes("LITOLOGIA", f.litologia)} />
          <TextInput type="date" label="De" value={f.de} onChange={(e) => setF({ ...f, de: e.currentTarget.value })} />
          <TextInput type="date" label="Até" value={f.ate} onChange={(e) => setF({ ...f, ate: e.currentTarget.value })} />
          <TextInput label="Número, descrição ou amostra" value={f.texto} onChange={(e) => setF({ ...f, texto: e.currentTarget.value })} />
        </SimpleGrid>
      </Paper>
      <Text size="sm" data-testid="rel-fichas-total">{n.isLoading ? "…" : `${n.data?.length ?? 0} ficha(s) com estes filtros`}</Text>
      <Group align="end">
        <Button onClick={() => tentar(() => baixar(`/minas/${mina.id}/relatorios/fichas.xlsx?${p}`, "fichas_mapeamento.xlsx"))}>Planilha Excel (fichas, intervalos, estruturas e amostras)</Button>
        <Select w={200} label="Tabela em CSV" value={tabela} onChange={(v) => setTabela(v ?? "fichas")} allowDeselect={false}
          data={[{ value: "fichas", label: "Fichas" }, { value: "intervalos", label: "Intervalos" }, { value: "estruturas", label: "Estruturas" }, { value: "amostras", label: "Amostras citadas" }]} />
        <Button variant="default" onClick={() => tentar(() => baixar(`/minas/${mina.id}/relatorios/fichas.csv?${pt}`, `fichas_${tabela}.csv`))}>Baixar CSV</Button>
      </Group>
      <Text size="xs" c="dimmed">Para imprimir uma ficha, abra-a em "Mapeamento geológico" e use "Imprimir". A ficha em branco para o campo também está lá.</Text>
    </Stack>
  );
}

function RelGeoquimica({ mina }: { mina: Mina }) {
  return (
    <Stack gap="xs">
      <Text size="sm">Tabela com uma linha por amostra e os teores de todos os elementos dos laudos (resultado preferido de cada análise).</Text>
      <Text size="sm">Para ver o perfil da frente de uma amostra com os teores, abra a amostra em <b>Amostras</b>. Para o log de um furo, use <b>Sondagem</b>.</Text>
      <Group>
        <Button variant="default" onClick={() => tentar(() => baixar(`/minas/${mina.id}/resultados/tabela.csv`, "teores_amostras.csv"))}>Baixar teores (CSV)</Button>
      </Group>
    </Stack>
  );
}

function RelHistorico() {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const tabelas = useQuery({ queryKey: ["aud-tabelas"], queryFn: () => api<{ valor: string; rotulo: string }[]>("/auditoria/tabelas") });
  const [tabela, setTabela] = useState<string | null>(null);
  const p = new URLSearchParams();
  if (de) p.set("de", de);
  if (ate) p.set("ate", ate);
  if (tabela) p.set("tabela", tabela);
  return (
    <Stack>
      <Group align="end">
        <Select label="Assunto" clearable w={240} data={(tabelas.data ?? []).map((t) => ({ value: t.valor, label: t.rotulo }))} value={tabela} onChange={setTabela} />
        <TextInput type="date" label="De" value={de} onChange={(e) => setDe(e.currentTarget.value)} />
        <TextInput type="date" label="Até" value={ate} onChange={(e) => setAte(e.currentTarget.value)} />
        <Button onClick={() => tentar(() => baixar(`/auditoria.csv?${p}`, "historico_alteracoes.csv"))}>Baixar CSV</Button>
      </Group>
      <Text size="xs" c="dimmed">Inclui o valor antes e depois de cada alteração. Limite de 50.000 linhas (as mais recentes); para mais, divida o período.</Text>
    </Stack>
  );
}
