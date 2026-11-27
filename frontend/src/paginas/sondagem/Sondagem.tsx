import {
  ActionIcon, Alert, Badge, Button, FileButton, FileInput, Group, Image, Loader, Modal, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Table, Text,
  TextInput, Textarea, Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router-dom";

import { api, CRS_OPCOES, dataCurta, ErroApi, json, urlArquivo, type Eu, type Mina } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { corLitologia, imprimirElemento, m, teor, type TermoP } from "../../componentes/perfil";

interface FuroL { id: string; codigo: string; projeto: string | null; area: string | null; profundidade_final: number; azimute: number | null; inclinacao: number | null; surveys: number; intervalos: number; amostras: number; amostras_com_resultado: number; data_inicio: string | null; responsavel: string | null }
interface IntervaloL { id: string; de: number; ate: number; litologia: TermoP | null; alteracao: TermoP | null; mineralizacao: TermoP | null; estruturas: string | null; descricao: string | null; observacoes: string | null }
interface AmostraL { id: string; codigo: string; de: number; ate: number; com_resultado: boolean; valores: Record<string, { texto: string; unidade: string; certificado: string }> }
interface Foto { id: string; documento_id: string; versao: number; titulo: string; de: number | null; ate: number | null; caixa: string | null; legenda: string | null; categoria: string; mime: string | null }
interface Log {
  furo: { id: string; codigo: string; projeto: string | null; area: string | null; x: number; y: number; z: number; srid: number; azimute: number | null; inclinacao: number | null; profundidade_final: number; data_inicio: string | null; data_fim: string | null; responsavel: string | null; metodo: string | null; descricao: string | null };
  intervalos: IntervaloL[];
  amostras: AmostraL[];
  sem_profundidade: string[];
  analitos: string[];
  unidades: Record<string, string>;
  fotos: Foto[];
}

export function Sondagem({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina antes de registrar sondagens.</Alert>;
  const pode = eu.permissoes.includes("sondagem:importar");
  return (
    <Routes>
      <Route index element={<Lista mina={mina} pode={pode} />} />
      <Route path=":id" element={<LogComId pode={pode} />} />
    </Routes>
  );
}

function LogComId({ pode }: { pode: boolean }) {
  const { id } = useParams();
  return <LogFuro key={id} id={id!} pode={pode} />;
}

// ------------------------------------------------------------------ lista de furos
function Lista({ mina, pode }: { mina: Mina; pode: boolean }) {
  const navegar = useNavigate();
  const furos = useQuery({ queryKey: ["furos", mina.id], queryFn: () => api<FuroL[]>(`/minas/${mina.id}/furos`) });
  const [novo, setNovo] = useState(false);
  const [importar, setImportar] = useState(false);
  const [texto, setTexto] = useState("");
  const lista = (furos.data ?? []).filter((f) => !texto.trim() || `${f.codigo} ${f.projeto ?? ""} ${f.area ?? ""}`.toLowerCase().includes(texto.trim().toLowerCase()));
  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={3}>Sondagem</Title>
          <Text size="sm" c="dimmed">Furos, descrição geológica, intervalos amostrados com os teores e fotos do testemunho. Clique num furo para ver o log.</Text>
        </div>
        {pode && (
          <Group gap={6}>
            <Button variant="default" onClick={() => setImportar(true)}>Importar planilhas…</Button>
            <Button onClick={() => setNovo(true)}>Novo furo</Button>
          </Group>
        )}
      </Group>
      <TextInput w={280} placeholder="Buscar furo, projeto ou área" value={texto} onChange={(e) => setTexto(e.currentTarget.value)} />
      {furos.isLoading ? <Loader size="sm" /> : !furos.data?.length ? (
        <Alert color="gray">Nenhum furo cadastrado. Use <b>Novo furo</b> ou <b>Importar planilhas…</b> (collar, survey, descrição geológica e amostras, em CSV ou Excel).</Alert>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover miw={760} data-testid="lista-furos">
            <Table.Thead><Table.Tr><Table.Th>Furo</Table.Th><Table.Th>Projeto / área</Table.Th><Table.Th ta="right">Profundidade (m)</Table.Th><Table.Th>Az / Inc</Table.Th><Table.Th>Início</Table.Th><Table.Th ta="right">Intervalos descritos</Table.Th><Table.Th ta="right">Amostras (com laudo)</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {lista.map((f) => (
                <Table.Tr key={f.id} style={{ cursor: "pointer" }} onClick={() => navegar(`/sondagem/${f.id}`)} data-furo={f.codigo}>
                  <Table.Td fw={600}>{f.codigo}</Table.Td>
                  <Table.Td>{[f.projeto, f.area].filter(Boolean).join(" · ")}</Table.Td>
                  <Table.Td ta="right">{m(f.profundidade_final)}</Table.Td>
                  <Table.Td>{f.azimute ?? "—"} / {f.inclinacao ?? "—"}</Table.Td>
                  <Table.Td>{f.data_inicio ? dataCurta(f.data_inicio) : ""}</Table.Td>
                  <Table.Td ta="right">{f.intervalos}</Table.Td>
                  <Table.Td ta="right">{f.amostras} ({f.amostras_com_resultado})</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      {novo && <NovoFuro mina={mina} aoFechar={() => setNovo(false)} aoCriar={(id) => navegar(`/sondagem/${id}`)} />}
      {importar && <ImportarSondagem mina={mina} fechar={() => setImportar(false)} />}
    </Stack>
  );
}

type N = number | string;
const num = (v: N) => (v === "" ? null : Number(v));

function NovoFuro({ mina, aoFechar, aoCriar }: { mina: Mina; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ codigo: "", x: "" as N, y: "" as N, z: "" as N, srid: String(mina.srid_trabalho), azimute: "" as N, inclinacao: "" as N, profundidade_final: "" as N, projeto: "", area: "", responsavel: "", metodo: "", descricao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => api<{ id: string }>(`/minas/${mina.id}/furos`, { method: "POST", body: json({
      codigo: f.codigo, x: num(f.x), y: num(f.y), z: num(f.z), srid: Number(f.srid), azimute: num(f.azimute), inclinacao: num(f.inclinacao),
      profundidade_final: num(f.profundidade_final), projeto: f.projeto || null, area: f.area || null, responsavel: f.responsavel || null, metodo: f.metodo || null, descricao: f.descricao || null,
    }) }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["furos"] }); notifications.show({ color: "teal", message: `Furo ${f.codigo.toUpperCase()} cadastrado.` }); aoCriar(r.id); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });
  const ok = f.codigo.trim() && f.x !== "" && f.y !== "" && f.z !== "" && Number(f.profundidade_final) > 0;
  return (
    <Modal opened onClose={aoFechar} size="lg" title="Novo furo de sondagem">
      <Stack gap="sm">
        {erro && <Alert color="red">{erro}</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="Código do furo" required value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value })} />
          <NumberInput label="Profundidade final (m)" required min={0} decimalSeparator="," value={f.profundidade_final} onChange={(v) => setF({ ...f, profundidade_final: v })} />
          <Select label="Sistema de coordenadas" allowDeselect={false} data={CRS_OPCOES} value={f.srid} onChange={(v) => setF({ ...f, srid: v ?? f.srid })} />
          <NumberInput label="X (boca do furo)" required decimalSeparator="," value={f.x} onChange={(v) => setF({ ...f, x: v })} />
          <NumberInput label="Y" required decimalSeparator="," value={f.y} onChange={(v) => setF({ ...f, y: v })} />
          <NumberInput label="Z (cota)" required decimalSeparator="," value={f.z} onChange={(v) => setF({ ...f, z: v })} />
          <NumberInput label="Azimute (°)" min={0} max={359.99} decimalSeparator="," value={f.azimute} onChange={(v) => setF({ ...f, azimute: v })} />
          <NumberInput label="Inclinação (°)" description="da horizontal; negativo = para baixo" min={-90} max={90} decimalSeparator="," value={f.inclinacao} onChange={(v) => setF({ ...f, inclinacao: v })} />
          <TextInput label="Método" placeholder="ex.: diamantada HQ" value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.currentTarget.value })} />
          <TextInput label="Projeto" value={f.projeto} onChange={(e) => setF({ ...f, projeto: e.currentTarget.value })} />
          <TextInput label="Área / alvo" value={f.area} onChange={(e) => setF({ ...f, area: e.currentTarget.value })} />
          <TextInput label="Geólogo responsável" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.currentTarget.value })} />
        </SimpleGrid>
        <Textarea label="Observações do furo" autosize minRows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.currentTarget.value })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={!ok} loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Cadastrar furo</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ log do furo
function LogFuro({ id, pode }: { id: string; pode: boolean }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["log-furo", id], queryFn: () => api<Log>(`/furos/${id}/perfil?analitos=*`) });
  const [editar, setEditar] = useState(false);
  const [fotos, setFotos] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const remover = useMutation({
    mutationFn: () => api(`/furos/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["furos"] }); notifications.show({ color: "teal", message: "Furo excluído." }); navegar("/sondagem"); },
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : "Falha ao excluir." }),
  });
  if (q.isLoading) return <Loader />;
  if (q.error || !q.data) return <Alert color="red">{q.error instanceof ErroApi ? q.error.message : "Furo não encontrado."}</Alert>;
  const d = q.data;
  const f = d.furo;
  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="subtle" size="xs" onClick={() => navegar("/sondagem")}>← Furos</Button>
          <Title order={3}>Log do furo {f.codigo}</Title>
        </Group>
        <Group gap={6}>
          {pode && <Button size="xs" variant="light" onClick={() => setEditar(true)}>Editar descrição</Button>}
          {pode && <Button size="xs" variant="light" onClick={() => setFotos(true)}>Enviar fotos / arquivos</Button>}
          <Button size="xs" variant="default" onClick={() => imprimirElemento(area.current, `Log ${f.codigo}`)}>Imprimir / PDF</Button>
          {pode && <Button size="xs" variant="subtle" color="red" onClick={() => setExcluir(true)}>Excluir furo</Button>}
        </Group>
      </Group>
      <div ref={area}>
        <h1 style={{ fontSize: 16, margin: "0 0 4px" }}>Log de sondagem — {f.codigo}</h1>
        <Paper withBorder p="xs">
          <SimpleGrid cols={{ base: 2, sm: 4, lg: 6 }} spacing={4} verticalSpacing={2}>
            <Info r="Projeto / área" v={[f.projeto, f.area].filter(Boolean).join(" · ")} />
            <Info r="Profundidade final" v={`${m(f.profundidade_final)} m`} />
            <Info r="Azimute / inclinação" v={`${f.azimute ?? "—"}° / ${f.inclinacao ?? "—"}°`} />
            <Info r="Boca (X, Y, Z)" v={`${m(f.x)}, ${m(f.y)}, ${m(f.z)} (EPSG:${f.srid})`} />
            <Info r="Período" v={[f.data_inicio && dataCurta(f.data_inicio), f.data_fim && dataCurta(f.data_fim)].filter(Boolean).join(" a ")} />
            <Info r="Responsável / método" v={[f.responsavel, f.metodo].filter(Boolean).join(" · ")} />
          </SimpleGrid>
          {f.descricao && <Text size="xs" mt={4}>{f.descricao}</Text>}
        </Paper>
        {d.sem_profundidade.length > 0 && <Alert color="yellow" mt="xs" p="xs">Amostras ligadas ao furo sem profundidade de/até: {d.sem_profundidade.join(", ")}</Alert>}
        <Group align="flex-start" wrap="nowrap" gap="md" mt="sm">
          <ColunaLog d={d} />
          <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
            <TabelaAmostras d={d} />
            <TabelaDescricao d={d} />
          </Stack>
        </Group>
        <Fotos d={d} pode={pode} />
      </div>
      {editar && <EditarDescricao d={d} aoFechar={() => setEditar(false)} />}
      {fotos && <EnviarFotos d={d} aoFechar={() => setFotos(false)} />}
      {excluir && (
        <Modal opened onClose={() => setExcluir(false)} title={`Excluir o furo ${f.codigo}?`}>
          <Stack>
            <Text size="sm">Some o furo, a descrição geológica e as fotos do log. As amostras e os laudos continuam cadastrados. Use só para furo cadastrado por engano.</Text>
            <Group justify="flex-end"><Button variant="default" onClick={() => setExcluir(false)}>Cancelar</Button><Button color="red" loading={remover.isPending} onClick={() => remover.mutate()}>Excluir</Button></Group>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}

function Info({ r, v }: { r: string; v: string }) {
  return <div><Text size="10px" c="dimmed">{r}</Text><Text size="xs" fw={500}>{v || "—"}</Text></div>;
}

function ColunaLog({ d }: { d: Log }) {
  const prof = Math.max(d.furo.profundidade_final, 1);
  const px = Math.min(40, Math.max(4, 900 / prof));
  const topo = 16, H = prof * px + topo + 12, W = 420;
  const y = (v: number) => topo + v * px;
  const passo = [1, 2, 5, 10, 20, 25, 50, 100].find((p) => p * px >= 28) ?? 100;
  const marcas: number[] = [];
  for (let v = 0; v <= prof + 1e-9; v += passo) marcas.push(v);
  const primeiro = d.analitos[0];
  const valoresPrim = d.amostras.map((a) => Number((a.valores[primeiro]?.texto ?? "").replace("<", "").replace(">", "").replace(",", "."))).filter(Number.isFinite);
  const maxPrim = valoresPrim.length ? Math.max(...valoresPrim) : 1;
  return (
    <svg width={W} height={H} style={{ flexShrink: 0, fontFamily: "Arial, sans-serif" }} data-testid="coluna-log">
      <text x={2} y={10} fontSize={9} fill="#555">Prof. (m)</text>
      <text x={46} y={10} fontSize={9} fill="#555">Litologia</text>
      <text x={110} y={10} fontSize={9} fill="#555">Descrição</text>
      <text x={290} y={10} fontSize={9} fill="#555">Amostras</text>
      {primeiro && <text x={360} y={10} fontSize={9} fill="#555">{primeiro} ({d.unidades[primeiro] ?? ""})</text>}
      {marcas.map((v) => <g key={v}><line x1={36} x2={42} y1={y(v)} y2={y(v)} stroke="#555" /><text x={34} y={y(v) + 3} fontSize={9} textAnchor="end">{m(v)}</text></g>)}
      <line x1={42} x2={42} y1={y(0)} y2={y(prof)} stroke="#555" />
      <rect x={42} y={y(0)} width={60} height={prof * px} fill="#fafafa" stroke="#bbb" strokeWidth={0.5} />
      {d.intervalos.map((t) => {
        const h = (t.ate - t.de) * px;
        const texto = [t.litologia?.nome, t.descricao].filter(Boolean).join(": ");
        return (
          <g key={t.id}>
            <rect x={42} y={y(t.de)} width={60} height={h} fill={corLitologia(t.litologia)} stroke="#333" strokeWidth={0.5}><title>{`${m(t.de)}–${m(t.ate)} m ${texto}`}</title></rect>
            {h >= 10 && t.litologia?.sigla && <text x={72} y={y(t.de) + h / 2 + 3} fontSize={9} textAnchor="middle">{t.litologia.sigla}</text>}
            <line x1={102} x2={282} y1={y(t.de)} y2={y(t.de)} stroke="#ddd" />
            {h >= 10 && (
              <foreignObject x={106} y={y(t.de) + 1} width={176} height={Math.max(h - 2, 0)}>
                <div style={{ fontSize: 9, lineHeight: "10px", overflow: "hidden", height: "100%" }}>{texto}</div>
              </foreignObject>
            )}
          </g>
        );
      })}
      {d.amostras.map((a) => {
        const h = Math.max((a.ate - a.de) * px, 1);
        const v = Number((a.valores[primeiro]?.texto ?? "").replace("<", "").replace(">", "").replace(",", "."));
        return (
          <g key={a.id}>
            <rect x={286} y={y(a.de)} width={70} height={h} fill={a.com_resultado ? "#d0ebff" : "#f1f3f5"} stroke="#1c7ed6" strokeWidth={0.6}><title>{`${a.codigo}: ${m(a.de)}–${m(a.ate)} m`}</title></rect>
            {h >= 9 && <text x={290} y={y(a.de) + h / 2 + 3} fontSize={8}>{a.codigo}</text>}
            {primeiro && Number.isFinite(v) && <rect x={360} y={y(a.de)} width={Math.max(1, (v / maxPrim) * 56)} height={h} fill="#e8590c" opacity={0.75}><title>{`${primeiro}: ${a.valores[primeiro]?.texto}`}</title></rect>}
          </g>
        );
      })}
      <line x1={42} x2={W - 4} y1={y(prof)} y2={y(prof)} stroke="#333" strokeDasharray="3 2" />
      <text x={W - 4} y={y(prof) + 10} fontSize={9} textAnchor="end">fim do furo {m(prof)} m</text>
    </svg>
  );
}

function litologiaEm(d: Log, de: number, ate: number) {
  const meio = (de + ate) / 2;
  return d.intervalos.find((i) => i.de <= meio && meio <= i.ate);
}

function TabelaAmostras({ d }: { d: Log }) {
  return (
    <div>
      <Text fw={600} size="sm">Intervalos amostrados e teores</Text>
      {!d.amostras.length ? <Text size="xs" c="dimmed">Nenhuma amostra ligada ao furo. Importe o arquivo de amostras (furo, amostra, de, até) em "Importar planilhas…".</Text> : (
        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={2} miw={420 + d.analitos.length * 60} data-testid="tabela-teores">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>De (m)</Table.Th><Table.Th>Até (m)</Table.Th><Table.Th>Esp. (m)</Table.Th><Table.Th>Amostra</Table.Th><Table.Th>Litologia</Table.Th>
                {d.analitos.map((a) => <Table.Th key={a} ta="right">{a}<br /><Text span size="10px" c="dimmed">{d.unidades[a]}</Text></Table.Th>)}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.amostras.map((a) => {
                const li = litologiaEm(d, a.de, a.ate);
                return (
                  <Table.Tr key={a.id}>
                    <Table.Td>{m(a.de)}</Table.Td><Table.Td>{m(a.ate)}</Table.Td><Table.Td>{m(a.ate - a.de)}</Table.Td>
                    <Table.Td fw={600}>{a.codigo}{!a.com_resultado && <Badge ml={4} size="xs" color="gray" variant="light">sem laudo</Badge>}</Table.Td>
                    <Table.Td>{li?.litologia?.nome ?? ""}</Table.Td>
                    {d.analitos.map((an) => <Table.Td key={an} ta="right">{teor(a.valores[an]?.texto)}</Table.Td>)}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}

function TabelaDescricao({ d }: { d: Log }) {
  const amostrasEm = (de: number, ate: number) => d.amostras.filter((a) => a.ate > de && a.de < ate).map((a) => a.codigo);
  return (
    <div>
      <Text fw={600} size="sm">Descrição geológica</Text>
      {!d.intervalos.length ? <Text size="xs" c="dimmed">Sem descrição. Use "Editar descrição" ou importe a planilha de geologia (furo, de, até, litologia, descrição).</Text> : (
        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={2} miw={760} data-testid="tabela-descricao">
            <Table.Thead><Table.Tr><Table.Th>De (m)</Table.Th><Table.Th>Até (m)</Table.Th><Table.Th>Esp. (m)</Table.Th><Table.Th>Litologia</Table.Th><Table.Th>Alteração</Table.Th><Table.Th>Mineralização</Table.Th><Table.Th>Estruturas</Table.Th><Table.Th>Descrição</Table.Th><Table.Th>Amostras</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.intervalos.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>{m(t.de)}</Table.Td><Table.Td>{m(t.ate)}</Table.Td><Table.Td>{m(t.ate - t.de)}</Table.Td>
                  <Table.Td><span style={{ display: "inline-block", width: 10, height: 10, background: corLitologia(t.litologia), border: "1px solid #555", marginRight: 4 }} />{t.litologia?.nome ?? ""}</Table.Td>
                  <Table.Td>{t.alteracao?.nome ?? ""}</Table.Td><Table.Td>{t.mineralizacao?.nome ?? ""}</Table.Td><Table.Td>{t.estruturas ?? ""}</Table.Td>
                  <Table.Td>{t.descricao ?? ""}{t.observacoes ? ` (${t.observacoes})` : ""}</Table.Td>
                  <Table.Td>{amostrasEm(t.de, t.ate).join(", ")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ fotos do testemunho
function Miniatura({ foto, aoAbrir }: { foto: Foto; aoAbrir: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let atual: string | null = null;
    if (foto.mime?.startsWith("image/")) urlArquivo(`/documentos/${foto.documento_id}/versoes/${foto.versao}/arquivo?tipo=miniatura`).then((u) => setUrl((atual = u))).catch(() => setUrl(null));
    return () => { if (atual) URL.revokeObjectURL(atual); };
  }, [foto.documento_id, foto.versao, foto.mime]);
  return (
    <Paper withBorder p={4} style={{ cursor: "pointer" }} onClick={aoAbrir}>
      {url ? <Image src={url} h={120} fit="contain" alt={foto.titulo} /> : <Text size="xs" c="dimmed" h={120} ta="center" pt={50}>{foto.mime === "application/pdf" ? "PDF" : "arquivo"}</Text>}
      <Text size="xs" fw={600} mt={2}>{foto.de != null ? `${m(foto.de)}–${m(foto.ate)} m` : "sem intervalo"}{foto.caixa ? ` · caixa ${foto.caixa}` : ""}</Text>
      <Text size="10px" c="dimmed" lineClamp={2}>{foto.legenda ?? foto.titulo}</Text>
    </Paper>
  );
}

function Fotos({ d, pode }: { d: Log; pode: boolean }) {
  const qc = useQueryClient();
  const [aberta, setAberta] = useState<{ foto: Foto; url: string } | null>(null);
  const abrir = async (foto: Foto) => {
    const u = await urlArquivo(`/documentos/${foto.documento_id}/versoes/${foto.versao}/arquivo?tipo=${foto.mime === "image/tiff" ? "previa" : "original"}`);
    if (foto.mime?.startsWith("image/")) setAberta({ foto, url: u });
    else window.open(u, "_blank");
  };
  const tirar = useMutation({
    mutationFn: (id: string) => api(`/fotos-furo/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["log-furo"] }); setAberta(null); },
  });
  return (
    <div style={{ marginTop: 12 }}>
      <Text fw={600} size="sm">Fotos do testemunho e arquivos do furo</Text>
      {!d.fotos.length ? <Text size="xs" c="dimmed">Nenhuma foto. Use "Enviar fotos / arquivos" para as caixas de testemunho (JPG, PNG, TIFF) ou a descrição em PDF.</Text> : (
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 6 }} spacing="xs" mt={4} data-testid="fotos-furo">
          {d.fotos.map((f) => <Miniatura key={f.id} foto={f} aoAbrir={() => abrir(f)} />)}
        </SimpleGrid>
      )}
      {aberta && (
        <Modal opened onClose={() => { URL.revokeObjectURL(aberta.url); setAberta(null); }} size="90%" title={aberta.foto.titulo}>
          <Image src={aberta.url} alt={aberta.foto.titulo} />
          <Group justify="space-between" mt="xs">
            <Text size="sm">{aberta.foto.legenda}</Text>
            {pode && <Button size="xs" color="red" variant="subtle" loading={tirar.isPending} onClick={() => tirar.mutate(aberta.foto.id)}>Tirar do log</Button>}
          </Group>
        </Modal>
      )}
    </div>
  );
}

function EnviarFotos({ d, aoFechar }: { d: Log; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [f, setF] = useState({ de: "" as N, ate: "" as N, caixa: "", legenda: "" });
  const [erro, setErro] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      for (const a of arquivos) fd.append("arquivos", a);
      if (f.de !== "") fd.append("de_m", String(f.de));
      if (f.ate !== "") fd.append("ate_m", String(f.ate));
      if (f.caixa) fd.append("caixa", f.caixa);
      if (f.legenda) fd.append("legenda", f.legenda);
      return api(`/furos/${d.furo.id}/fotos`, { method: "POST", body: fd });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["log-furo"] }); notifications.show({ color: "teal", message: `${arquivos.length} arquivo(s) enviado(s).` }); aoFechar(); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao enviar."),
  });
  return (
    <Modal opened onClose={aoFechar} title={`Fotos / arquivos do furo ${d.furo.codigo}`}>
      <Stack gap="sm">
        {erro && <Alert color="red">{erro}</Alert>}
        <FileButton multiple accept="image/jpeg,image/png,image/tiff,application/pdf" onChange={setArquivos}>
          {(props) => <Button variant="light" {...props}>{arquivos.length ? `${arquivos.length} arquivo(s) escolhido(s)` : "Escolher fotos ou PDF"}</Button>}
        </FileButton>
        <Group grow>
          <NumberInput label="De (m)" min={0} decimalSeparator="," value={f.de} onChange={(v) => setF({ ...f, de: v })} />
          <NumberInput label="Até (m)" min={0} decimalSeparator="," value={f.ate} onChange={(v) => setF({ ...f, ate: v })} />
          <TextInput label="Caixa" value={f.caixa} onChange={(e) => setF({ ...f, caixa: e.currentTarget.value })} />
        </Group>
        <TextInput label="Legenda" value={f.legenda} onChange={(e) => setF({ ...f, legenda: e.currentTarget.value })} />
        <Text size="xs" c="dimmed">As fotos também ficam guardadas em "Fotos e croquis".</Text>
        <Group justify="flex-end"><Button variant="default" onClick={aoFechar}>Cancelar</Button><Button disabled={!arquivos.length} loading={enviar.isPending} onClick={() => { setErro(null); enviar.mutate(); }}>Enviar</Button></Group>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ edição da descrição
interface LinhaD { de: N; ate: N; litologia_id: string | null; alteracao_id: string | null; mineralizacao_id: string | null; estruturas: string; descricao: string }

function EditarDescricao({ d, aoFechar }: { d: Log; aoFechar: () => void }) {
  const qc = useQueryClient();
  const dic = useDicionarios();
  const [linhas, setLinhas] = useState<LinhaD[]>(() => d.intervalos.length ? d.intervalos.map((t) => ({ de: t.de, ate: t.ate, litologia_id: t.litologia?.id ?? null, alteracao_id: t.alteracao?.id ?? null, mineralizacao_id: t.mineralizacao?.id ?? null, estruturas: t.estruturas ?? "", descricao: t.descricao ?? "" }))
    : [{ de: 0, ate: Math.min(1, d.furo.profundidade_final), litologia_id: null, alteracao_id: null, mineralizacao_id: null, estruturas: "", descricao: "" }]);
  const [erro, setErro] = useState<string | null>(null);
  const up = (k: number, p: Partial<LinhaD>) => setLinhas(linhas.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const mais = () => { const de = linhas.length ? Number(linhas[linhas.length - 1].ate) || 0 : 0; setLinhas([...linhas, { de, ate: Math.min(de + 1, d.furo.profundidade_final), litologia_id: null, alteracao_id: null, mineralizacao_id: null, estruturas: "", descricao: "" }]); };
  const salvar = useMutation({
    mutationFn: () => api(`/furos/${d.furo.id}/intervalos`, { method: "PUT", body: json({ intervalos: linhas.map((l) => ({ de_m: Number(l.de), ate_m: Number(l.ate), litologia_id: l.litologia_id, alteracao_id: l.alteracao_id, mineralizacao_id: l.mineralizacao_id, estruturas: l.estruturas || null, descricao: l.descricao || null })) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["log-furo"] }); qc.invalidateQueries({ queryKey: ["furos"] }); notifications.show({ color: "teal", message: "Descrição do furo salva." }); aoFechar(); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });
  return (
    <Modal opened onClose={aoFechar} size="95%" title={`Descrição geológica do furo ${d.furo.codigo} (0 a ${m(d.furo.profundidade_final)} m)`}>
      <Stack gap="xs">
        {erro && <Alert color="red">{erro}</Alert>}
        <ScrollArea>
          <Table fz="xs" miw={1100} verticalSpacing={2}>
            <Table.Thead><Table.Tr><Table.Th w={80}>De (m)</Table.Th><Table.Th w={80}>Até (m)</Table.Th><Table.Th w={190}>Litologia</Table.Th><Table.Th w={160}>Alteração</Table.Th><Table.Th w={160}>Mineralização</Table.Th><Table.Th w={130}>Estruturas</Table.Th><Table.Th>Descrição</Table.Th><Table.Th w={30} /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {linhas.map((l, k) => (
                <Table.Tr key={k}>
                  <Table.Td><NumberInput size="xs" min={0} decimalSeparator="," value={l.de} onChange={(v) => up(k, { de: v })} aria-label="De" /></Table.Td>
                  <Table.Td><NumberInput size="xs" min={0} decimalSeparator="," value={l.ate} onChange={(v) => up(k, { ate: v })} aria-label="Até" /></Table.Td>
                  <Table.Td><Select size="xs" searchable clearable data={dic.opcoes("LITOLOGIA", l.litologia_id)} value={l.litologia_id} onChange={(v) => up(k, { litologia_id: v })} aria-label="Litologia" /></Table.Td>
                  <Table.Td><Select size="xs" searchable clearable data={dic.opcoes("ALTERACAO", l.alteracao_id)} value={l.alteracao_id} onChange={(v) => up(k, { alteracao_id: v })} aria-label="Alteração" /></Table.Td>
                  <Table.Td><Select size="xs" searchable clearable data={dic.opcoes("MINERALIZACAO", l.mineralizacao_id)} value={l.mineralizacao_id} onChange={(v) => up(k, { mineralizacao_id: v })} aria-label="Mineralização" /></Table.Td>
                  <Table.Td><TextInput size="xs" value={l.estruturas} onChange={(e) => up(k, { estruturas: e.currentTarget.value })} aria-label="Estruturas" /></Table.Td>
                  <Table.Td><Textarea size="xs" autosize minRows={1} value={l.descricao} onChange={(e) => up(k, { descricao: e.currentTarget.value })} aria-label="Descrição" /></Table.Td>
                  <Table.Td><ActionIcon size="sm" variant="subtle" color="red" onClick={() => setLinhas(linhas.filter((_, i) => i !== k))} aria-label="Remover intervalo">✕</ActionIcon></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="space-between">
          <Button size="xs" variant="light" onClick={mais}>+ Intervalo</Button>
          <Group gap={6}><Button size="xs" variant="default" onClick={aoFechar}>Cancelar</Button><Button size="xs" loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar descrição</Button></Group>
        </Group>
      </Stack>
    </Modal>
  );
}

// ------------------------------------------------------------------ importação (collar, survey, geologia, amostras)
interface Previa { id: string; furos: { furo: string; novo: boolean; surveys: number; intervalos: number; amostras: number }[]; erros: { arquivo: string; linha: number | null; mensagem: string }[]; avisos: { arquivo: string; linha: number | null; mensagem: string }[]; convencao_descricao: string }

function ImportarSondagem({ mina, fechar }: { mina: Mina; fechar: () => void }) {
  const qc = useQueryClient();
  const [arqs, setArqs] = useState<Record<string, File | null>>({ collar: null, survey: null, geologia: null, amostras: null });
  const [srid, setSrid] = useState<string>(String(mina.srid_trabalho));
  const [conv, setConv] = useState("horizontal_negativo");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const analisar = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("srid", srid); fd.append("convencao", conv); fd.append("referencia_azimute", "quadricula"); fd.append("declinacao", "0");
      for (const [k, f] of Object.entries(arqs)) if (f) fd.append(k, f);
      return api<Previa>(`/minas/${mina.id}/sondagem/importacoes`, { method: "POST", body: fd });
    },
    onSuccess: setPrevia,
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  const confirmar = useMutation({
    mutationFn: (ignorar: boolean) => api<Record<string, number>>(`/importacoes/${previa!.id}/confirmar-sondagem`, { method: "POST", body: json({ ignorar_erros: ignorar }) }),
    onSuccess: (g) => { qc.invalidateQueries(); notifications.show({ color: "teal", message: `Gravados: ${g.furos} furo(s), ${g.intervalos} intervalo(s) descritos, ${g.amostras_ligadas} amostra(s) (${g.amostras_novas} nova(s)), ${g.resultados_ligados} resultado(s) de laudo ligados.` }); fechar(); },
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  return (
    <Modal opened onClose={fechar} size="xl" title="Importar planilhas de sondagem">
      <Stack gap="xs">
        <Text size="sm">Envie um ou mais arquivos (CSV ou Excel). Cabeçalhos em português ou inglês: furo/hole_id, x/este, y/norte, z/cota, azimute, inclinação/dip, profundidade/depth, de/from, até/to, litologia, alteração, mineralização, descrição, amostra/sample.</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {(["collar", "survey", "geologia", "amostras"] as const).map((t) => (
            <FileInput key={t} size="xs" clearable label={{ collar: "Collar (boca e profundidade do furo)", survey: "Survey (desvio do furo)", geologia: "Descrição geológica (de, até, litologia, descrição)", amostras: "Amostras (furo, amostra, de, até)" }[t]}
              accept=".csv,.txt,.xlsx" value={arqs[t]} onChange={(f) => { setArqs({ ...arqs, [t]: f }); setPrevia(null); }} placeholder="escolher arquivo" />
          ))}
        </SimpleGrid>
        <Group grow align="flex-end">
          <Select size="xs" label="Sistema das coordenadas do collar" allowDeselect={false} value={srid} onChange={(v) => setSrid(v ?? srid)} data={CRS_OPCOES} />
          <Select size="xs" label="Inclinação no arquivo" allowDeselect={false} value={conv} onChange={(v) => setConv(v ?? "horizontal_negativo")}
            data={[{ value: "horizontal_negativo", label: "Da horizontal, negativo = para baixo (−60)" }, { value: "horizontal_positivo", label: "Da horizontal, positivo = para baixo (60)" }, { value: "vertical", label: "Da vertical (0 = para baixo)" }]} />
        </Group>
        <Text size="xs" c="dimmed">Os teores entram pelo laudo do laboratório (menu "Laboratório (laudos)"): o GeoMina liga cada resultado à amostra pelo código.</Text>
        <Button w="fit-content" disabled={!Object.values(arqs).some(Boolean)} loading={analisar.isPending} onClick={() => analisar.mutate()}>Ler e validar</Button>
        {previa && (
          <Stack gap={6}>
            <Table fz={12} verticalSpacing={1} withTableBorder data-testid="previa-furos">
              <Table.Thead><Table.Tr><Table.Th>Furo</Table.Th><Table.Th /><Table.Th ta="right">Survey</Table.Th><Table.Th ta="right">Intervalos</Table.Th><Table.Th ta="right">Amostras</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{previa.furos.map((f) => <Table.Tr key={f.furo}><Table.Td fw={600}>{f.furo}</Table.Td><Table.Td>{f.novo ? <Badge size="xs">novo</Badge> : <Badge size="xs" color="gray">já cadastrado</Badge>}</Table.Td><Table.Td ta="right">{f.surveys}</Table.Td><Table.Td ta="right">{f.intervalos}</Table.Td><Table.Td ta="right">{f.amostras}</Table.Td></Table.Tr>)}</Table.Tbody>
            </Table>
            {previa.erros.length > 0 && (
              <Alert color="red" p="xs" title={`${previa.erros.length} erro(s) — essas linhas não podem ser gravadas`}>
                <ScrollArea.Autosize mah={140}>{previa.erros.map((e, i) => <Text key={i} size="xs">{e.arquivo}{e.linha ? `, linha ${e.linha}` : ""}: {e.mensagem}</Text>)}</ScrollArea.Autosize>
              </Alert>
            )}
            {previa.avisos.length > 0 && (
              <Alert color="yellow" p="xs" title={`${previa.avisos.length} aviso(s)`}>
                <ScrollArea.Autosize mah={120}>{previa.avisos.map((e, i) => <Text key={i} size="xs">{e.arquivo}{e.linha ? `, linha ${e.linha}` : ""}: {e.mensagem}</Text>)}</ScrollArea.Autosize>
              </Alert>
            )}
            <Group>
              {!previa.erros.length && <Button loading={confirmar.isPending} onClick={() => confirmar.mutate(false)}>Confirmar importação</Button>}
              {previa.erros.length > 0 && <Button color="orange" loading={confirmar.isPending} onClick={() => confirmar.mutate(true)}>Gravar só as linhas sem erro</Button>}
            </Group>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
