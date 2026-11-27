import {
  Alert, Badge, Button, Checkbox, FileButton, Group, Loader, Modal, NumberInput, Paper, ScrollArea, Select, SimpleGrid, Stack, Table,
  Tabs, Text, TextInput, Textarea, Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  api, CRS_OPCOES, dataCurta, enviarArquivos, ErroApi, ESTADOS_AMOSTRA, json, PAPEIS_CONTROLE,
  type Amostra, type Eu, type Lote, type Mina,
} from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { SeletorLocal } from "../../componentes/SeletorLocal";
import { PerfilFrente } from "./PerfilFrente";

export function Amostras({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina antes de registrar amostras.</Alert>;
  const podeEditar = eu.permissoes.includes("amostra:editar");
  return (
    <Stack>
      <Title order={3}>Amostras</Title>
      <Tabs defaultValue="lista" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="lista">Amostras</Tabs.Tab>
          <Tabs.Tab value="lotes">Lotes de envio</Tabs.Tab>
          {eu.permissoes.includes("amostra:importar") && <Tabs.Tab value="importar">Importar planilha</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="lista" pt="sm"><Lista mina={mina} podeEditar={podeEditar} /></Tabs.Panel>
        <Tabs.Panel value="lotes" pt="sm"><Lotes mina={mina} podeEditar={podeEditar} /></Tabs.Panel>
        <Tabs.Panel value="importar" pt="sm"><Importar mina={mina} /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function Lista({ mina, podeEditar }: { mina: Mina; podeEditar: boolean }) {
  const dic = useDicionarios();
  const [f, setF] = useState({ texto: "", serie: null as string | null, estado: null as string | null, papel: null as string | null, litologia: null as string | null });
  const [aberta, setAberta] = useState<Amostra | "nova" | null>(null);
  const [perfil, setPerfil] = useState<Amostra | null>(null);
  const p = new URLSearchParams();
  if (f.texto.trim()) p.set("texto", f.texto.trim());
  if (f.serie) p.set("serie", f.serie);
  if (f.estado) p.set("estado", f.estado);
  if (f.papel) p.set("papel", f.papel);
  if (f.litologia) p.set("litologia_id", f.litologia);
  const lista = useQuery({ queryKey: ["amostras", mina.id, p.toString()], queryFn: () => api<Amostra[]>(`/minas/${mina.id}/amostras?${p}`) });
  return (
    <Stack gap="sm">
      <Paper withBorder p="sm">
        <SimpleGrid cols={{ base: 1, xs: 2, md: 5 }}>
          <TextInput label="Código, local ou descrição" value={f.texto} onChange={(e) => setF({ ...f, texto: e.currentTarget.value })} />
          <Select label="Série" clearable value={f.serie} onChange={(v) => setF({ ...f, serie: v })} data={["BS-RP", "BMT-TS", "BE"]} />
          <Select label="Situação" clearable value={f.estado} onChange={(v) => setF({ ...f, estado: v })} data={Object.entries(ESTADOS_AMOSTRA).map(([value, e]) => ({ value, label: e.rotulo }))} />
          <Select label="Controle de qualidade" clearable value={f.papel} onChange={(v) => setF({ ...f, papel: v })} data={Object.entries(PAPEIS_CONTROLE).map(([value, label]) => ({ value, label }))} />
          <Select label="Litologia" clearable searchable value={f.litologia} onChange={(v) => setF({ ...f, litologia: v })} data={dic.opcoes("LITOLOGIA", f.litologia)} />
        </SimpleGrid>
      </Paper>
      <Group justify="space-between">
        <Group gap={6}><Text size="sm" c="dimmed">{lista.data?.length ?? 0} amostra(s)</Text><Text size="xs" c="dimmed">· clique numa amostra para ver o perfil da frente com os teores</Text></Group>
        {podeEditar && <Button size="xs" onClick={() => setAberta("nova")}>Nova amostra</Button>}
      </Group>
      {lista.isLoading ? <Loader size="sm" /> : (
        <ScrollArea>
          <Table striped highlightOnHover miw={760}>
            <Table.Thead>
              <Table.Tr><Table.Th>Código</Table.Th><Table.Th>Data</Table.Th><Table.Th>Local</Table.Th><Table.Th>Seção (m)</Table.Th><Table.Th>Litologia</Table.Th><Table.Th>Ficha</Table.Th><Table.Th>Situação</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(lista.data ?? []).map((a) => (
                <Table.Tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setPerfil(a)} data-amostra={a.codigo}>
                  <Table.Td fw={500}>{a.codigo}{a.papel_controle !== "normal" && <Badge size="xs" ml={4} variant="outline">{PAPEIS_CONTROLE[a.papel_controle]}</Badge>}</Table.Td>
                  <Table.Td>{a.data_coleta ? dataCurta(a.data_coleta) : ""}</Table.Td>
                  <Table.Td fz="xs">{a.unidade ?? a.local_descricao ?? (a.furo ? `furo ${a.furo}` : "")}</Table.Td>
                  <Table.Td fz="xs">{a.secao_de_m !== null ? `${a.secao_de_m}–${a.secao_ate_m}` : a.prof_de_m !== null ? `${a.prof_de_m}–${a.prof_ate_m} (prof.)` : ""}</Table.Td>
                  <Table.Td fz="xs">{a.litologia ?? ""}</Table.Td>
                  <Table.Td fz="xs">{a.ficha ?? ""}</Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color={ESTADOS_AMOSTRA[a.estado].cor}>{ESTADOS_AMOSTRA[a.estado].rotulo}</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      {perfil && !aberta && <PerfilFrente amostraId={perfil.id} podeEditar={podeEditar} aoFechar={() => setPerfil(null)} aoEditarAmostra={() => setAberta(perfil)} />}
      {aberta && <FormAmostra mina={mina} amostra={aberta === "nova" ? null : aberta} podeEditar={podeEditar} aoFechar={() => setAberta(null)} />}
    </Stack>
  );
}

type N = number | string;
const n = (v: N) => (v === "" ? null : Number(v));

function FormAmostra({ mina, amostra, podeEditar, aoFechar }: { mina: Mina; amostra: Amostra | null; podeEditar: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const dic = useDicionarios();
  const tipos = useQuery({ queryKey: ["tipos-amostra"], queryFn: () => api<{ id: string; nome: string }[]>("/tipos-amostra") });
  const a = amostra;
  const [f, setF] = useState({
    codigo: a?.codigo ?? "", papel_controle: a?.papel_controle ?? "normal", amostra_original_codigo: a?.amostra_original_codigo ?? "",
    padrao_codigo: a?.padrao_codigo ?? "", tipo_id: a?.tipo_id ?? null, data_coleta: a?.data_coleta ?? new Date().toISOString().slice(0, 10),
    unidade_id: a?.unidade_id ?? null, local_descricao: a?.local_descricao ?? "", secao_de_m: (a?.secao_de_m ?? "") as N, secao_ate_m: (a?.secao_ate_m ?? "") as N,
    x: (a?.x ?? "") as N, y: (a?.y ?? "") as N, z: (a?.z ?? "") as N, srid: String(a?.srid ?? mina.srid_trabalho), furo: a?.furo ?? "",
    prof_de_m: (a?.prof_de_m ?? "") as N, prof_ate_m: (a?.prof_ate_m ?? "") as N, litologia_id: a?.litologia_id ?? null,
    destino_id: a?.destino_id ?? null, massa_kg: (a?.massa_kg ?? "") as N, descricao: a?.descricao ?? "", observacoes: a?.observacoes ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const proximo = async (serie: string) => setF({ ...f, codigo: (await api<{ codigo: string }>(`/minas/${mina.id}/amostras/proximo-codigo?serie=${serie}`)).codigo });
  const corpo = () => ({
    ...f, amostra_original_codigo: f.amostra_original_codigo || null, padrao_codigo: f.padrao_codigo || null, unidade_id: f.unidade_id,
    local_descricao: f.local_descricao || null, secao_de_m: n(f.secao_de_m), secao_ate_m: n(f.secao_ate_m), x: n(f.x), y: n(f.y), z: n(f.z),
    srid: n(f.x) === null ? null : Number(f.srid), furo: f.furo || null, prof_de_m: n(f.prof_de_m), prof_ate_m: n(f.prof_ate_m),
    massa_kg: n(f.massa_kg), descricao: f.descricao || null, observacoes: f.observacoes || null, data_coleta: f.data_coleta || null,
    mapeamento_id: a?.mapeamento_id ?? null,
  });
  const salvar = useMutation({
    mutationFn: () => a ? api(`/amostras/${a.id}`, { method: "PUT", body: json({ ...corpo(), versao: a.versao }) }) : api(`/minas/${mina.id}/amostras`, { method: "POST", body: json(corpo()) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["amostras"] }); notifications.show({ color: "teal", message: "Amostra salva." }); aoFechar(); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message + (e.detalhes && (e.detalhes as { sugestao?: string }).sugestao ? ` Sugestão: ${(e.detalhes as { sugestao: string }).sugestao}` : "") : "Falha ao salvar."),
  });
  const ro = !podeEditar || a?.estado === "cancelada";
  return (
    <Modal opened onClose={aoFechar} size="lg" title={a ? `Amostra ${a.codigo}` : "Nova amostra"}>
      <Stack gap="xs">
        {erro && <Alert color="red">{erro}</Alert>}
        {a && <Text size="xs" c="dimmed">{ESTADOS_AMOSTRA[a.estado].rotulo}{a.lotes.length ? ` · lote ${a.lotes.join(", ")}` : ""}{a.ficha ? ` · ficha ${a.ficha}` : ""}{a.responsavel ? ` · ${a.responsavel}` : ""}</Text>}
        <Group align="flex-end" gap="xs">
          <TextInput label="Código" placeholder="BS-RP-475" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value })} readOnly={ro} style={{ flex: 1 }} />
          {!a && !ro && <Button variant="light" size="sm" onClick={() => proximo("BS-RP")}>Próximo BS-RP</Button>}
          {!a && !ro && <Button variant="light" size="sm" onClick={() => proximo("BMT-TS")}>Próximo BMT-TS</Button>}
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Select label="Controle de qualidade" allowDeselect={false} value={f.papel_controle} onChange={(v) => setF({ ...f, papel_controle: v ?? "normal" })} data={Object.entries(PAPEIS_CONTROLE).map(([value, label]) => ({ value, label }))} readOnly={ro} />
          {f.papel_controle.startsWith("dup") && <TextInput label="Amostra original" value={f.amostra_original_codigo} onChange={(e) => setF({ ...f, amostra_original_codigo: e.currentTarget.value })} readOnly={ro} />}
          {f.papel_controle === "padrao" && <TextInput label="Material de referência" placeholder="OREAS920B" value={f.padrao_codigo} onChange={(e) => setF({ ...f, padrao_codigo: e.currentTarget.value })} readOnly={ro} />}
          <Select label="Tipo" clearable value={f.tipo_id} onChange={(v) => setF({ ...f, tipo_id: v })} data={(tipos.data ?? []).map((t) => ({ value: t.id, label: t.nome }))} readOnly={ro} />
          <TextInput type="date" label="Data da coleta" value={f.data_coleta} onChange={(e) => setF({ ...f, data_coleta: e.currentTarget.value })} readOnly={ro} />
          <SeletorLocal mina={mina} label="Local (unidade)" valor={f.unidade_id} aoMudar={(v) => setF({ ...f, unidade_id: v })} readOnly={ro} />
          <TextInput label="Descrição do local" value={f.local_descricao} onChange={(e) => setF({ ...f, local_descricao: e.currentTarget.value })} readOnly={ro} />
          <NumberInput label="Seção: de (m)" decimalSeparator="," min={0} value={f.secao_de_m} onChange={(v) => setF({ ...f, secao_de_m: v })} readOnly={ro} />
          <NumberInput label="Seção: até (m)" decimalSeparator="," min={0} value={f.secao_ate_m} onChange={(v) => setF({ ...f, secao_ate_m: v })} readOnly={ro} />
          <TextInput label="Furo (testemunho)" value={f.furo} onChange={(e) => setF({ ...f, furo: e.currentTarget.value })} readOnly={ro} />
          <NumberInput label="Profundidade de (m)" decimalSeparator="," min={0} value={f.prof_de_m} onChange={(v) => setF({ ...f, prof_de_m: v })} readOnly={ro} />
          <NumberInput label="Profundidade até (m)" decimalSeparator="," min={0} value={f.prof_ate_m} onChange={(v) => setF({ ...f, prof_ate_m: v })} readOnly={ro} />
          <NumberInput label="X" decimalSeparator="," value={f.x} onChange={(v) => setF({ ...f, x: v })} readOnly={ro} />
          <NumberInput label="Y" decimalSeparator="," value={f.y} onChange={(v) => setF({ ...f, y: v })} readOnly={ro} />
          <NumberInput label="Z" decimalSeparator="," value={f.z} onChange={(v) => setF({ ...f, z: v })} readOnly={ro} />
          <Select label="Sistema das coordenadas" allowDeselect={false} data={CRS_OPCOES} value={f.srid} onChange={(v) => setF({ ...f, srid: v ?? "31983" })} readOnly={ro} />
          <Select label="Litologia" clearable searchable value={f.litologia_id} onChange={(v) => setF({ ...f, litologia_id: v })} data={dic.opcoes("LITOLOGIA", f.litologia_id)} readOnly={ro} />
          <Select label="Destino" clearable value={f.destino_id} onChange={(v) => setF({ ...f, destino_id: v })} data={dic.opcoes("DESTINO_AMOSTRA", f.destino_id)} readOnly={ro} />
          <NumberInput label="Massa (kg)" decimalSeparator="," min={0} value={f.massa_kg} onChange={(v) => setF({ ...f, massa_kg: v })} readOnly={ro} />
        </SimpleGrid>
        <Textarea label="Descrição" autosize minRows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.currentTarget.value })} readOnly={ro} />
        <Textarea label="Observações" autosize minRows={1} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.currentTarget.value })} readOnly={ro} />
        {a && <ResultadosAmostra id={a.id} />}
        {!ro && <Button loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar</Button>}
      </Stack>
    </Modal>
  );
}

function Lotes({ mina, podeEditar }: { mina: Mina; podeEditar: boolean }) {
  const qc = useQueryClient();
  const lotes = useQuery({ queryKey: ["lotes", mina.id], queryFn: () => api<Lote[]>(`/minas/${mina.id}/lotes`) });
  const [novo, setNovo] = useState({ codigo: "", laboratorio: "SGS Geosol", amostras: "" });
  const [incluir, setIncluir] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const codigos = (t: string) => t.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const falha = (e: unknown) => setErro(e instanceof ErroApi ? e.message : "Falha na operação.");
  const ok = () => { qc.invalidateQueries({ queryKey: ["lotes"] }); qc.invalidateQueries({ queryKey: ["amostras"] }); setErro(null); };
  const criar = useMutation({ mutationFn: () => api(`/minas/${mina.id}/lotes`, { method: "POST", body: json({ ...novo, amostras: codigos(novo.amostras) }) }), onSuccess: () => { ok(); setNovo({ ...novo, codigo: "", amostras: "" }); }, onError: falha });
  const acao = useMutation({ mutationFn: (p: { url: string; corpo: unknown }) => api(p.url, { method: "POST", body: json(p.corpo) }), onSuccess: ok, onError: falha });
  return (
    <Stack gap="sm">
      {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}
      {podeEditar && (
        <Paper withBorder p="sm">
          <Text fw={600} size="sm" mb="xs">Novo lote de envio</Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Código do lote" placeholder="L-2026-10" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.currentTarget.value })} />
            <TextInput label="Laboratório" value={novo.laboratorio} onChange={(e) => setNovo({ ...novo, laboratorio: e.currentTarget.value })} />
            <Textarea label="Amostras (códigos, um por linha)" autosize minRows={1} value={novo.amostras} onChange={(e) => setNovo({ ...novo, amostras: e.currentTarget.value })} />
          </SimpleGrid>
          <Button size="xs" mt="xs" loading={criar.isPending} onClick={() => criar.mutate()}>Criar lote</Button>
        </Paper>
      )}
      {(lotes.data ?? []).map((l) => (
        <Paper key={l.id} withBorder p="sm">
          <Group justify="space-between">
            <Text fw={600}>{l.codigo} · {l.laboratorio}</Text>
            <Badge color={l.estado === "enviado" ? "teal" : "gray"}>{l.estado === "enviado" ? `enviado em ${dataCurta(l.data_envio!)}` : "aberto"}</Badge>
          </Group>
          <Text size="xs" mt={4}>{l.amostras.length} amostra(s): {l.amostras.join(", ")}</Text>
          {podeEditar && l.estado === "aberto" && (
            <Group mt="xs" gap="xs" align="flex-end">
              <TextInput size="xs" label="Incluir amostras" placeholder="BS-RP-480, BS-RP-481" value={incluir[l.id] ?? ""} onChange={(e) => setIncluir({ ...incluir, [l.id]: e.currentTarget.value })} />
              <Button size="xs" variant="light" onClick={() => acao.mutate({ url: `/lotes/${l.id}/amostras`, corpo: { codigos: codigos(incluir[l.id] ?? "") } })}>Incluir</Button>
              <Button size="xs" onClick={() => acao.mutate({ url: `/lotes/${l.id}/enviar`, corpo: { data_envio: new Date().toISOString().slice(0, 10) } })}>Marcar como enviado hoje</Button>
            </Group>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

interface Previa {
  id: string;
  nome_arquivo: string;
  total: number;
  resumo: Record<string, number>;
  com_coordenadas: number;
  litologias_nao_reconhecidas: Record<string, number>;
  linhas: { linha: number; original: string; codigo: string | null; status: string; mensagens: string[]; local: string | null; de: number | null; ate: number | null; litologia: string | null; litologia_texto: string | null; data: string | null; x: number | null; unidade?: string | null; unidade_texto?: string | null }[];
}
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  ok: { rotulo: "ok", cor: "teal" }, sugestao: { rotulo: "confirmar código", cor: "yellow" }, erro: { rotulo: "código inválido", cor: "red" },
  repetido: { rotulo: "repetida na planilha", cor: "orange" }, existente: { rotulo: "já cadastrada", cor: "gray" },
};

function Importar({ mina }: { mina: Mina }) {
  const qc = useQueryClient();
  const dic = useDicionarios();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [op, setOp] = useState({ srid: null as string | null, aceitar: false, repetidos: "primeira" });
  const [mapa, setMapa] = useState<Record<string, string | null>>({});
  const [resultado, setResultado] = useState<{ gravadas: number; trechos_perfil?: number; ignoradas: { linha: number; codigo: string; motivo: string }[] } | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const analisar = useMutation({
    mutationFn: (arq: File) => enviarArquivos<Previa>(`/minas/${mina.id}/amostras/importacoes`, {}, [arq], "arquivo"),
    onSuccess: (p) => { setPrevia(p); setResultado(null); setMapa({}); setOp({ srid: null, aceitar: false, repetidos: "primeira" }); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao ler a planilha."),
  });
  const confirmar = useMutation({
    mutationFn: () => api<{ gravadas: number; trechos_perfil?: number; ignoradas: { linha: number; codigo: string; motivo: string }[] }>(`/importacoes/${previa!.id}/confirmar-amostras`, {
      method: "POST", body: json({ srid: op.srid ? Number(op.srid) : null, aceitar_sugestoes: op.aceitar, repetidos: op.repetidos, litologias: mapa }),
    }),
    onSuccess: (r) => { setResultado(r); qc.invalidateQueries({ queryKey: ["amostras"] }); notifications.show({ color: "teal", message: `${r.gravadas} amostra(s) importada(s).` }); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha na importação."),
  });
  const linhas = (previa?.linhas ?? []).filter((l) => !filtro || l.status === filtro);
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        1) Escolha a planilha (Excel .xlsx ou CSV). 2) Confira a prévia: nada é gravado antes da confirmação. 3) Decida sobre códigos, coordenadas e litologias e confirme.
        O arquivo original fica guardado junto com o relatório da importação.
      </Text>
      {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}
      <FileButton accept=".xlsx,.csv,.txt" onChange={(a) => a && (setErro(null), analisar.mutate(a))}>
        {(props) => <Button w="fit-content" loading={analisar.isPending} {...props}>Escolher planilha</Button>}
      </FileButton>
      {previa && !resultado && (
        <>
          <Paper withBorder p="sm">
            <Text fw={600}>{previa.nome_arquivo}: {previa.total} linha(s) com amostra</Text>
            <Group gap={6} mt={4}>
              {Object.entries(previa.resumo).map(([s, q]) => q > 0 && (
                <Badge key={s} color={STATUS[s].cor} variant={filtro === s ? "filled" : "light"} style={{ cursor: "pointer" }} onClick={() => setFiltro(filtro === s ? null : s)}>{STATUS[s].rotulo}: {q}</Badge>
              ))}
            </Group>
          </Paper>
          <Paper withBorder p="sm">
            <Stack gap="xs">
              <Checkbox label={`Aceitar as ${previa.resumo.sugestao ?? 0} sugestões de código (ex.: "RP 478" → BS-RP-478)`} checked={op.aceitar} onChange={(e) => setOp({ ...op, aceitar: e.currentTarget.checked })} />
              <Select label={`Sistema das coordenadas da planilha (${previa.com_coordenadas} linhas com XYZ)`} description="Se não souber, deixe vazio: as coordenadas ficam só como observação e não são usadas."
                clearable data={CRS_OPCOES} value={op.srid} onChange={(v) => setOp({ ...op, srid: v })} maw={480} />
              <Select label="Código repetido na planilha" allowDeselect={false} value={op.repetidos} onChange={(v) => setOp({ ...op, repetidos: v ?? "primeira" })} maw={480}
                data={[{ value: "primeira", label: "Importar só a primeira ocorrência" }, { value: "ignorar", label: "Não importar nenhuma ocorrência" }]} />
              {Object.keys(previa.litologias_nao_reconhecidas).length > 0 && (
                <>
                  <Text size="sm" fw={600}>Litologias não reconhecidas no dicionário ({Object.keys(previa.litologias_nao_reconhecidas).length})</Text>
                  <Text size="xs" c="dimmed">Associe a um termo ou deixe vazio (o texto original fica registrado na amostra). Para novas litologias, cadastre-as em Dicionários.</Text>
                  <ScrollArea.Autosize mah={260}>
                    <Stack gap={4}>
                      {Object.entries(previa.litologias_nao_reconhecidas).map(([t, q]) => (
                        <Group key={t} gap="xs" wrap="nowrap">
                          <Text size="xs" style={{ flex: 1 }}>{t} <Text span c="dimmed">({q})</Text></Text>
                          <Select size="xs" w={260} clearable searchable placeholder="manter só o texto" data={dic.opcoes("LITOLOGIA")} value={mapa[t] ?? null} onChange={(v) => setMapa({ ...mapa, [t]: v })} />
                        </Group>
                      ))}
                    </Stack>
                  </ScrollArea.Autosize>
                </>
              )}
              <Group>
                <Button loading={confirmar.isPending} onClick={() => { setErro(null); confirmar.mutate(); }}>Confirmar importação</Button>
                <Button variant="subtle" onClick={() => { api(`/importacoes/${previa.id}`, { method: "DELETE" }).catch(() => undefined); setPrevia(null); }}>Descartar</Button>
              </Group>
            </Stack>
          </Paper>
          <ScrollArea h={420}>
            <Table striped miw={900} stickyHeader>
              <Table.Thead><Table.Tr><Table.Th>Linha</Table.Th><Table.Th>Na planilha</Table.Th><Table.Th>Código</Table.Th><Table.Th>Situação</Table.Th><Table.Th>Local</Table.Th><Table.Th>Seção</Table.Th><Table.Th>Litologia</Table.Th><Table.Th>Data</Table.Th><Table.Th>Mensagens</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {linhas.slice(0, 500).map((l) => (
                  <Table.Tr key={l.linha}>
                    <Table.Td>{l.linha}</Table.Td><Table.Td fz="xs">{l.original}</Table.Td><Table.Td fw={500}>{l.codigo}</Table.Td>
                    <Table.Td><Badge size="xs" color={STATUS[l.status].cor}>{STATUS[l.status].rotulo}</Badge></Table.Td>
                    <Table.Td fz="xs">{l.unidade ? <Text span fw={600} fz="xs">{l.unidade}</Text> : l.unidade_texto ? <Text span c="orange" fz="xs">{l.unidade_texto}</Text> : null}{(l.unidade || l.unidade_texto) && l.local ? " · " : ""}{l.local}</Table.Td><Table.Td fz="xs">{l.de !== null ? `${l.de}–${l.ate}` : ""}</Table.Td>
                    <Table.Td fz="xs">{l.litologia ?? <Text span c="orange" fz="xs">{l.litologia_texto}</Text>}</Table.Td>
                    <Table.Td fz="xs">{l.data ? dataCurta(l.data) : ""}</Table.Td><Table.Td fz="xs">{l.mensagens.join(" ")}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}
      {resultado && (
        <Alert color="teal" title={`${resultado.gravadas} amostra(s) importada(s)`}>
          {(resultado.trechos_perfil ?? 0) > 0 && <div>{resultado.trechos_perfil} trecho(s) gravados no perfil da frente (cada metro com a rocha e a amostra).</div>}
          {resultado.ignoradas.length} linha(s) não viraram amostra nova (já cadastradas ou repetidas continuam no perfil da frente):
          <ScrollArea.Autosize mah={200}>
            {resultado.ignoradas.map((i) => <div key={i.linha}>linha {i.linha} · {i.codigo} · {i.motivo}</div>)}
          </ScrollArea.Autosize>
        </Alert>
      )}
    </Stack>
  );
}

export function ResultadosAmostra({ id }: { id: string }) {
  const r = useQuery({ queryKey: ["resultados-amostra", id], queryFn: () => api<{ analito: string; metodo: string; certificado: string; tipo_linha: string; valor: string; unidade: string; preferido: boolean }[]>(`/amostras/${id}/resultados`) });
  if (!r.data?.length) return <Text size="xs" c="dimmed">Sem resultados de laboratório.</Text>;
  const pref = r.data.filter((x) => x.preferido);
  return (
    <Paper withBorder p="xs">
      <Text size="sm" fw={600} mb={4}>Resultados de laboratório ({pref.length} analitos · certificado {[...new Set(pref.map((x) => x.certificado))].join(", ")})</Text>
      <Group gap={4}>
        {pref.map((x) => <Badge key={x.analito + x.metodo} variant="light" color="gray" tt="none">{x.analito}: {x.valor} {x.unidade}</Badge>)}
      </Group>
      {r.data.length > pref.length && <Text size="xs" c="dimmed" mt={4}>Há também {r.data.length - pref.length} resultado(s) de controle ou de certificados anteriores (ver Geoquímica).</Text>}
    </Paper>
  );
}
