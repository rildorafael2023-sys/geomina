import { Alert, Badge, Button, FileButton, Group, Loader, Paper, Radio, ScrollArea, Select, Stack, Table, Tabs, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, enviarArquivos, ErroApi, json, type Eu, type Mina } from "../../api/cliente";
import { Planta } from "./Planta";

interface CamadaCad { nome: string; feicoes: number; z_min?: number; z_mediana?: number; z_max?: number; fracao_zero?: number; z_suspeito?: boolean }
interface OpcaoTrans { id: string; nome: string; metodo: string; aprovada: boolean; residuo_medio_m?: number | null; precisao_m?: number | null; observacao?: string; origem_calibracao?: string }
interface CamadaAnalise {
  membro: string; camada: string; erro?: string; tipo: string; com_z: boolean; feicoes: number; vazias: number; vertices: number;
  epsg: number | null; crs_nome: string | null; compatibilidade: "mesmo_crs" | "transformar" | "crs_desconhecido"; srid_mina: number;
  z_min: number | null; z_max: number | null; feicoes_z_constante: number; camadas_cad: CamadaCad[]; transformacoes?: OpcaoTrans[];
}
interface Transformacao { id: string; nome: string; srid_origem: number; srid_destino: number; metodo: string; parametros: { dx: number; dy: number; dz: number }; residuo_medio_m: number | null; residuo_max_m: number | null; pontos: number | null; origem_calibracao: string | null; aprovada: boolean }
interface Levantamento { id: string; codigo: string; descricao: string | null; data_levantamento: string | null; camada: string; tipo: string; srid_original: number; transformacao: string | null; feicoes: number; vertices: number; extensao: (number | null)[]; arquivado: boolean; camadas_cad: { nome: string; feicoes: number; z_suspeito: boolean }[] }

const NOME_EPSG: Record<number, string> = { 31983: "SIRGAS 2000 / UTM 23S", 29193: "SAD69 / UTM 23S" };
const epsg = (n: number | null) => (n ? `${NOME_EPSG[n] ?? "EPSG"} (${n})` : "não identificado");
const msg = (e: unknown) => (e instanceof ErroApi ? e.message : String(e));

export function Topografia({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  const [zSusp, setZSusp] = useState(false);
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina primeiro.</Alert>;
  const importa = eu.permissoes.includes("topografia:importar");
  return (
    <Stack>
      <Title order={3}>Topografia</Title>
      <Tabs defaultValue="planta" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="planta">Planta</Tabs.Tab>
          <Tabs.Tab value="levantamentos">Levantamentos</Tabs.Tab>
          {importa && <Tabs.Tab value="importar">Importar shapefile</Tabs.Tab>}
          <Tabs.Tab value="transformacoes">Transformações de coordenadas</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="planta" pt="sm">
          <Stack gap="xs">
            <Radio.Group value={zSusp ? "s" : "n"} onChange={(v) => setZSusp(v === "s")}>
              <Group><Radio value="n" label="Ocultar camadas com cota suspeita (textos, cota 0)" /><Radio value="s" label="Mostrar tudo" /></Group>
            </Radio.Group>
            <Planta minaId={mina.id} incluirZSuspeito={zSusp} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="levantamentos" pt="sm"><Levantamentos mina={mina} podeArquivar={importa} /></Tabs.Panel>
        <Tabs.Panel value="importar" pt="sm"><Importar mina={mina} /></Tabs.Panel>
        <Tabs.Panel value="transformacoes" pt="sm"><Transformacoes mina={mina} pode={eu.permissoes.includes("topografia:transformar")} /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function Levantamentos({ mina, podeArquivar }: { mina: Mina; podeArquivar: boolean }) {
  const qc = useQueryClient();
  const l = useQuery({ queryKey: ["levantamentos", mina.id], queryFn: () => api<Levantamento[]>(`/minas/${mina.id}/levantamentos`) });
  const arquivar = useMutation({ mutationFn: (id: string) => api(`/levantamentos/${id}/arquivar`, { method: "POST" }), onSuccess: () => qc.invalidateQueries() });
  if (!l.data) return <Loader size="sm" />;
  if (!l.data.length) return <Text c="dimmed" size="sm">Nenhum levantamento importado.</Text>;
  return (
    <Table.ScrollContainer minWidth={900}>
    <Table striped>
      <Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Data</Table.Th><Table.Th>Arquivo / camada</Table.Th><Table.Th>Sistema original</Table.Th><Table.Th>Transformação</Table.Th><Table.Th>Feições</Table.Th><Table.Th>Cotas</Table.Th><Table.Th /></Table.Tr></Table.Thead>
      <Table.Tbody>
        {l.data.map((v) => (
          <Table.Tr key={v.id} opacity={v.arquivado ? 0.5 : 1}>
            <Table.Td fw={600}>{v.codigo}{v.arquivado && <Badge ml={6} size="xs" color="gray">arquivado</Badge>}</Table.Td>
            <Table.Td>{v.data_levantamento ? new Date(v.data_levantamento + "T00:00").toLocaleDateString("pt-BR") : ""}</Table.Td>
            <Table.Td><Text size="xs">{v.camada}</Text><Text size="xs" c="dimmed">{v.camadas_cad.length} camadas CAD{v.camadas_cad.some((c) => c.z_suspeito) ? ` (${v.camadas_cad.filter((c) => c.z_suspeito).length} com cota suspeita)` : ""}</Text></Table.Td>
            <Table.Td>{epsg(v.srid_original)}</Table.Td>
            <Table.Td>{v.transformacao ?? (v.srid_original === mina.srid_trabalho ? "não precisou" : "PROJ padrão")}</Table.Td>
            <Table.Td>{v.feicoes.toLocaleString("pt-BR")}</Table.Td>
            <Table.Td>{v.extensao[2] != null ? `${v.extensao[2]?.toFixed(1)} a ${v.extensao[5]?.toFixed(1)} m` : "sem cota"}</Table.Td>
            <Table.Td>{podeArquivar && <Button size="compact-xs" variant="subtle" onClick={() => arquivar.mutate(v.id)}>{v.arquivado ? "Reativar" : "Arquivar"}</Button>}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
    </Table.ScrollContainer>
  );
}

function Importar({ mina }: { mina: Mina }) {
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<{ id: string; nome_arquivo: string; camadas: CamadaAnalise[] } | null>(null);
  const [membro, setMembro] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [data, setData] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [trans, setTrans] = useState<string | null>(null);
  const [srid, setSrid] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<string[]>([]);
  const [resultado, setResultado] = useState<string | null>(null);
  const analisar = useMutation({
    mutationFn: (f: File) => enviarArquivos<{ id: string; nome_arquivo: string; camadas: CamadaAnalise[] }>(`/minas/${mina.id}/topografia/importacoes`, {}, [f], "arquivo"),
    onSuccess: (p) => {
      setPrevia(p); setResultado(null);
      const boa = p.camadas.find((c) => !c.erro && c.compatibilidade === "mesmo_crs") ?? p.camadas.find((c) => !c.erro);
      escolherCamada(boa ?? null);
    },
    onError: (e) => notifications.show({ color: "red", message: msg(e) }),
  });
  function escolherCamada(c: CamadaAnalise | null) {
    setMembro(c?.membro ?? null);
    setExcluir([]);
    const rec = c?.transformacoes?.find((t) => t.metodo === "translacao" && t.aprovada);
    setTrans(rec?.id ?? null);
  }
  const confirmar = useMutation({
    mutationFn: () => api<{ feicoes: number; transformacao: string; camadas_z_suspeito: string[] }>(`/importacoes/${previa!.id}/confirmar-topografia`, {
      method: "POST", body: json({ membro, codigo, data_levantamento: data || null, responsavel: responsavel || null, transformacao: trans, srid_declarado: srid ? Number(srid) : null, camadas_excluidas: excluir }),
    }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      setResultado(`${r.feicoes.toLocaleString("pt-BR")} feições importadas. Transformação: ${r.transformacao}.` + (r.camadas_z_suspeito.length ? ` Camadas com cota suspeita (ocultas na planta): ${r.camadas_z_suspeito.join(", ")}.` : ""));
      setPrevia(null);
    },
    onError: (e) => notifications.show({ color: "red", message: msg(e) }),
  });
  const c = previa?.camadas.find((x) => x.membro === membro);
  return (
    <Stack gap="sm">
      <Text size="sm">Envie um <b>.zip</b> com o shapefile da topografia (.shp, .shx, .dbf, .prj e .cpg). Primeiro o GeoMina mostra o que encontrou; nada é gravado antes da confirmação.</Text>
      <FileButton onChange={(f) => f && analisar.mutate(f)} accept=".zip">{(p) => <Button {...p} w="fit-content" loading={analisar.isPending}>Escolher arquivo .zip</Button>}</FileButton>
      {resultado && <Alert color="teal" title="Importação concluída">{resultado}</Alert>}
      {previa && (
        <Paper withBorder p="sm">
          <Stack gap="sm">
            <Text fw={600}>{previa.nome_arquivo}</Text>
            <Radio.Group label="Camada (arquivo .shp) a importar" value={membro} onChange={(m) => escolherCamada(previa.camadas.find((x) => x.membro === m) ?? null)}>
              <Stack gap={4} mt={4}>
                {previa.camadas.map((x) => (
                  <Radio key={x.membro} value={x.membro} disabled={!!x.erro} label={
                    <Text size="sm">{x.membro.split("/").slice(-2).join("/")} — {x.erro ? <Text span c="red">{x.erro}</Text> : `${x.feicoes.toLocaleString("pt-BR")} feições, ${x.tipo}, ${epsg(x.epsg)}`}</Text>} />
                ))}
              </Stack>
            </Radio.Group>
            {c && !c.erro && (
              <>
                <Group gap="xs">
                  <Badge color={c.compatibilidade === "mesmo_crs" ? "teal" : c.compatibilidade === "transformar" ? "orange" : "red"}>
                    {c.compatibilidade === "mesmo_crs" ? "mesmo sistema da mina" : c.compatibilidade === "transformar" ? `precisa converter para ${epsg(c.srid_mina)}` : "sistema de coordenadas não identificado"}
                  </Badge>
                  <Badge variant="light">{c.vertices.toLocaleString("pt-BR")} vértices</Badge>
                  {c.com_z ? <Badge variant="light">cotas {c.z_min} a {c.z_max} m</Badge> : <Badge color="orange">sem cota (2D)</Badge>}
                  {c.vazias > 0 && <Badge color="gray">{c.vazias} registros vazios (ignorados)</Badge>}
                  {c.feicoes_z_constante > 0 && <Badge variant="light" color="gray">{c.feicoes_z_constante} linhas com cota constante</Badge>}
                </Group>
                {c.compatibilidade === "crs_desconhecido" && (
                  <Select label="Em que sistema estão estas coordenadas?" w={340} value={srid} onChange={setSrid}
                    data={[{ value: "31983", label: "SIRGAS 2000 / UTM 23S (31983)" }, { value: "29193", label: "SAD69 / UTM 23S (29193)" }]} />
                )}
                {c.compatibilidade === "transformar" && (
                  <Radio.Group label="Transformação (obrigatório escolher — o GeoMina não converte sem avisar)" value={trans} onChange={setTrans}>
                    <Stack gap={4} mt={4}>
                      {(c.transformacoes ?? []).map((t) => (
                        <Radio key={t.id} value={t.id} disabled={!t.aprovada} label={
                          <Text size="sm">{t.nome}{t.metodo === "translacao" ? ` — calibrada com a topografia da mina (resíduo médio ${t.residuo_medio_m} m)${t.aprovada ? " · recomendada" : " · aguardando aprovação"}` : ` — ${t.observacao ?? ""}`}</Text>} />
                      ))}
                    </Stack>
                  </Radio.Group>
                )}
                {c.compatibilidade === "transformar" && !c.transformacoes?.some((t) => t.metodo === "translacao") && (
                  <Alert color="yellow">A topografia da mina costuma usar uma translação própria entre SAD69 e SIRGAS (aqui o PROJ padrão difere ~2 m). Se tiver o mesmo levantamento nos dois sistemas, faça a calibração na aba <b>Transformações de coordenadas</b> antes de importar.</Alert>
                )}
                <Text size="sm" fw={600}>Camadas do CAD (campo Layer)</Text>
                <ScrollArea.Autosize mah={320}>
                <Table fz="xs" striped stickyHeader>
                  <Table.Thead><Table.Tr><Table.Th>Importar</Table.Th><Table.Th>Camada</Table.Th><Table.Th>Feições</Table.Th><Table.Th>Cota mín / mediana / máx</Table.Th><Table.Th>Situação</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {c.camadas_cad.map((k) => (
                      <Table.Tr key={k.nome}>
                        <Table.Td><input type="checkbox" checked={!excluir.includes(k.nome)} onChange={(e) => setExcluir((s) => (e.target.checked ? s.filter((x) => x !== k.nome) : [...s, k.nome]))} /></Table.Td>
                        <Table.Td>{k.nome}</Table.Td><Table.Td>{k.feicoes}</Table.Td>
                        <Table.Td>{k.z_mediana != null ? `${k.z_min} / ${k.z_mediana} / ${k.z_max}` : "—"}</Table.Td>
                        <Table.Td>{k.z_suspeito ? <Badge size="xs" color="orange">cota suspeita</Badge> : ""}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                </ScrollArea.Autosize>
                <Text size="xs" c="dimmed">"Cota suspeita": a maioria dos vértices tem cota 0 ou a cota está muito longe das demais camadas (ex.: textos e cotas do desenho). Elas são importadas, mas ficam ocultas na planta e fora do 3D, a menos que você escolha mostrá-las.</Text>
                <Group align="flex-end">
                  <TextInput label="Código do levantamento" required placeholder="TOPO-2026-09" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
                  <TextInput label="Data do levantamento" type="date" value={data} onChange={(e) => setData(e.currentTarget.value)} />
                  <TextInput label="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.currentTarget.value)} />
                  <Button loading={confirmar.isPending} disabled={!codigo || (c.compatibilidade === "transformar" && !trans) || (c.compatibilidade === "crs_desconhecido" && !srid)} onClick={() => confirmar.mutate()}>Confirmar importação</Button>
                </Group>
              </>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function Transformacoes({ mina, pode }: { mina: Mina; pode: boolean }) {
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ["transformacoes", mina.id], queryFn: () => api<Transformacao[]>(`/minas/${mina.id}/transformacoes`) });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [membros, setMembros] = useState<string[]>([]);
  const [origem, setOrigem] = useState<string | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [nome, setNome] = useState("SAD69 → SIRGAS 2000 (topografia da mina)");
  const listar = useMutation({
    mutationFn: (f: File) => enviarArquivos<{ camadas: CamadaAnalise[] }>(`/minas/${mina.id}/topografia/importacoes`, {}, [f], "arquivo"),
    onSuccess: (p, f) => {
      setArquivo(f); setMembros(p.camadas.map((c) => c.membro));
      // par provável: destino no sistema da mina e origem em outro sistema com o mesmo número de registros
      const dest = p.camadas.find((c) => !c.erro && c.epsg === mina.srid_trabalho);
      const orig = p.camadas.find((c) => !c.erro && c.epsg && c.epsg !== mina.srid_trabalho && c.feicoes === dest?.feicoes)
        ?? p.camadas.find((c) => !c.erro && c.epsg && c.epsg !== mina.srid_trabalho);
      setOrigem(orig?.membro ?? null); setDestino(dest?.membro ?? null);
    },
    onError: (e) => notifications.show({ color: "red", message: msg(e) }),
  });
  const calibrar = useMutation({
    mutationFn: () => enviarArquivos<{ dx: number; dy: number; residuo_medio_m: number; proj_erro_medio_m?: number }>(`/minas/${mina.id}/transformacoes/calibrar`, { membro_origem: origem, membro_destino: destino, nome }, [arquivo!], "arquivo"),
    onSuccess: (r) => {
      qc.invalidateQueries();
      notifications.show({ id: "calibracao", color: "teal", autoClose: false, message: `Translação: dx ${r.dx} m, dy ${r.dy} m. Resíduo médio ${r.residuo_medio_m} m (PROJ padrão erraria em média ${r.proj_erro_medio_m} m). Aprove para usar.` });
      setArquivo(null);
    },
    onError: (e) => notifications.show({ color: "red", message: msg(e) }),
  });
  const aprovar = useMutation({ mutationFn: (id: string) => api(`/transformacoes/${id}/aprovar`, { method: "POST" }), onSuccess: () => { notifications.hide("calibracao"); qc.invalidateQueries(); } });
  return (
    <Stack gap="sm">
      <Text size="sm">Uma transformação converte coordenadas de um sistema para o da mina ({epsg(mina.srid_trabalho)}). Sem transformação aprovada, dados em outro sistema não são convertidos — ficam de fora com aviso.</Text>
      <Table.ScrollContainer minWidth={800}>
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Nome</Table.Th><Table.Th>De → para</Table.Th><Table.Th>Parâmetros</Table.Th><Table.Th>Resíduo médio / máx.</Table.Th><Table.Th>Calibração</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>
          {(t.data ?? []).map((x) => (
            <Table.Tr key={x.id}>
              <Table.Td fw={500}>{x.nome}</Table.Td><Table.Td>{x.srid_origem} → {x.srid_destino}</Table.Td>
              <Table.Td ff="monospace" fz="xs">dx {x.parametros.dx} · dy {x.parametros.dy} · dz {x.parametros.dz}</Table.Td>
              <Table.Td>{x.residuo_medio_m} / {x.residuo_max_m} m ({x.pontos} pontos)</Table.Td>
              <Table.Td><Text size="xs">{x.origem_calibracao}</Text></Table.Td>
              <Table.Td>{x.aprovada ? <Badge color="teal">aprovada</Badge> : pode ? <Button size="compact-xs" onClick={() => aprovar.mutate(x.id)}>Aprovar</Button> : <Badge color="gray">aguardando revisor</Badge>}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>
      {pode && (
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Text fw={600}>Calibrar com a topografia da mina</Text>
            <Text size="xs" c="dimmed">Envie um .zip com o <b>mesmo levantamento</b> exportado nos dois sistemas (ex.: pastas SAD e SIRGAS). O GeoMina compara vértice a vértice e calcula o deslocamento usado pela topografia, mostrando o resíduo.</Text>
            <FileButton onChange={(f) => f && listar.mutate(f)} accept=".zip">{(p) => <Button {...p} variant="light" w="fit-content" loading={listar.isPending}>Escolher .zip</Button>}</FileButton>
            {arquivo && (
              <Group align="flex-end">
                <Select label="Arquivo no sistema antigo (origem)" w={360} data={membros} value={origem} onChange={setOrigem} />
                <Select label="Mesmo levantamento no sistema da mina (destino)" w={360} data={membros} value={destino} onChange={setDestino} />
                <TextInput label="Nome" w={320} value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
                <Button loading={calibrar.isPending} disabled={!origem || !destino} onClick={() => calibrar.mutate()}>Calcular</Button>
              </Group>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
