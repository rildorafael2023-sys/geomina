import { Alert, Badge, Button, FileButton, Group, Loader, Modal, MultiSelect, Paper, ScrollArea, Select, Stack, Table, Tabs, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDownload, IconFlask } from "@tabler/icons-react";
import { useState } from "react";

import { BarraFiltros, Carregando, Pagina, Painel, TabelaDados, Vazio, type Coluna } from "../../componentes/ui";
import { api, baixar, dataHora, enviarArquivos, ErroApi, json, type Eu, type Mina } from "../../api/cliente";

interface Previa {
  id: string; nome_arquivo: string; formato: string; certificado: string | null; emitido_em: string | null; projeto: string | null;
  referencia: string | null; colunas: { analito: string; unidade: string; metodo: string; novo: boolean }[];
  linhas: { linha: number; tipo: string; codigo_laboratorio: string; codigo: string | null; situacao: string; estado_amostra: string | null; valores: number }[];
  resumo: Record<string, number>; tipos: Record<string, number>; erros_valor: { linha: number; coluna: string; erro: string }[];
  certificado_ja_importado: boolean; arquivo_ja_importado: boolean;
}
const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  vinculada: { rotulo: "amostra cadastrada", cor: "teal" }, nao_encontrada: { rotulo: "amostra não cadastrada", cor: "orange" },
  controle_lab: { rotulo: "controle do laboratório", cor: "gray" },
};

export function Geoquimica({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Carregando />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina primeiro.</Alert>;
  return (
    <Pagina titulo="Laboratório — laudos e QA/QC" icone={<IconFlask size={20} />} subtitulo="Resultados dos laudos, certificados, controles de qualidade (QA/QC) e importação de novos laudos">
      <Tabs defaultValue="resultados" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="resultados">Resultados</Tabs.Tab>
          <Tabs.Tab value="certificados">Certificados e QA/QC</Tabs.Tab>
          {eu.permissoes.includes("amostra:importar") && <Tabs.Tab value="importar">Importar laudo</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="resultados" pt="sm"><Resultados mina={mina} /></Tabs.Panel>
        <Tabs.Panel value="certificados" pt="sm"><Certificados mina={mina} /></Tabs.Panel>
        <Tabs.Panel value="importar" pt="sm"><Importar mina={mina} /></Tabs.Panel>
      </Tabs>
    </Pagina>
  );
}

function Resultados({ mina, certificadoId }: { mina: Mina; certificadoId?: string }) {
  const analitos = useQuery({ queryKey: ["analitos"], queryFn: () => api<{ codigo: string; tipo: string }[]>("/analitos") });
  const [sel, setSel] = useState<string[]>([]);
  const [controles, setControles] = useState(!!certificadoId);
  const p = new URLSearchParams();
  if (sel.length) p.set("analitos", sel.join(","));
  if (certificadoId) p.set("certificado_id", certificadoId);
  if (controles) p.set("incluir_controles", "true");
  const t = useQuery({ queryKey: ["tabela", mina.id, p.toString()], queryFn: () => api<{ colunas: string[]; total: number; linhas: { amostra: string | null; codigo_laboratorio: string; tipo: string; certificado: string; valores: Record<string, string> }[] }>(`/minas/${mina.id}/resultados/tabela?${p}`) });
  const linhas = (t.data?.linhas ?? []).map((l, i) => ({ ...l, _i: i }));
  const colunas: Coluna<(typeof linhas)[number]>[] = [
    { chave: "amostra", titulo: "Amostra", fixa: true, valor: (l) => l.amostra ?? l.codigo_laboratorio,
      render: (l) => (l.amostra ? <Text size="sm" fw={600}>{l.amostra}</Text> : <Text span c="orange" fz="xs">{l.codigo_laboratorio}</Text>) },
    { chave: "tipo", titulo: "Tipo", valor: (l) => l.tipo, largura: 60 },
    { chave: "certificado", titulo: "Certificado", valor: (l) => l.certificado },
    ...(t.data?.colunas ?? []).map((c) => ({ chave: `v:${c}`, titulo: c, numero: true, valor: (l: (typeof linhas)[number]) => {
      const v = l.valores[c]; if (v == null) return null; const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : v; },
      render: (l: (typeof linhas)[number]) => (l.valores[c] ?? "").replace(".", ",") })),
  ];
  return (
    <Stack gap={10}>
      <BarraFiltros fim={<Button variant="default" leftSection={<IconDownload size={14} />} onClick={() => baixar(`/minas/${mina.id}/resultados/tabela.csv?${p}`, "resultados_geomina.csv")}>Exportar CSV</Button>}>
        <MultiSelect label="Analitos (vazio = todos)" searchable clearable w={420} value={sel} onChange={setSel}
          data={(analitos.data ?? []).map((a) => ({ value: a.codigo, label: `${a.codigo} (${a.tipo})` }))} />
        <Select label="Linhas" w={280} allowDeselect={false} value={controles ? "s" : "n"} onChange={(v) => setControles(v === "s")}
          data={[{ value: "n", label: "Só amostras (SMP)" }, { value: "s", label: "Incluir controles (DUP, REP, STD, branco)" }]} />
      </BarraFiltros>
      <Painel p={0} titulo={`${linhas.length.toLocaleString("pt-BR")} linha(s) · ${t.data?.colunas.length ?? 0} analito(s)`}
        descricao={(certificadoId ? "Todas as linhas deste certificado, como vieram do laudo." : "Um valor por amostra e analito: o resultado preferido (certificado mais recente).") + " Valores abaixo/acima do limite aparecem como no laudo (ex.: <0,5), nunca como zero."}>
        {t.data && t.data.total > t.data.linhas.length && (
          <Text size="sm" c="orange" px={10} pt={6} data-testid="tabela-limitada">Mostrando {t.data.linhas.length.toLocaleString("pt-BR")} de {t.data.total.toLocaleString("pt-BR")} linhas. Use "Exportar CSV" para ter todas, ou filtre os analitos.</Text>
        )}
        <TabelaDados dados={linhas} chave={(l) => String(l._i)} colunas={colunas} busca densa
          alturaMax={certificadoId ? 420 : "calc(100vh - 330px)"} minLargura={Math.max(600, 220 + (t.data?.colunas.length ?? 0) * 74)}
          vazio={t.isLoading ? <Carregando /> : <Vazio titulo="Nenhum resultado." descricao="Importe um laudo na aba Importar laudo." />} />
      </Painel>
    </Stack>
  );
}

function Certificados({ mina }: { mina: Mina }) {
  const qc = useQueryClient();
  const certs = useQuery({ queryKey: ["certificados", mina.id], queryFn: () => api<{ id: string; codigo: string; laboratorio: string; emitido_em: string | null; referencia: string | null; projeto: string | null; resultados: number; amostras: number }[]>(`/minas/${mina.id}/certificados`) });
  const [aberto, setAberto] = useState<{ id: string; codigo: string } | null>(null);
  const [verTabela, setVerTabela] = useState(false);
  const vincular = useMutation({
    mutationFn: () => api<{ vinculados: number; amostras: number }>(`/minas/${mina.id}/resultados/vincular-pendentes`, { method: "POST" }),
    onSuccess: (r) => { qc.invalidateQueries(); notifications.show({ color: "teal", message: `${r.vinculados} resultado(s) ligados a ${r.amostras} amostra(s) cadastradas depois.` }); },
  });
  return (
    <Stack gap="sm">
      <Button size="xs" variant="light" w="fit-content" loading={vincular.isPending} onClick={() => vincular.mutate()}>Ligar resultados pendentes às amostras cadastradas</Button>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Certificado</Table.Th><Table.Th>Laboratório</Table.Th><Table.Th>Emissão</Table.Th><Table.Th>Referência</Table.Th><Table.Th>Amostras</Table.Th><Table.Th>Resultados</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {(certs.data ?? []).map((c) => (
            <Table.Tr key={c.id} style={{ cursor: "pointer" }} onClick={() => { setVerTabela(false); setAberto(c); }}>
              <Table.Td fw={500}>{c.codigo}</Table.Td><Table.Td>{c.laboratorio}</Table.Td><Table.Td>{c.emitido_em ? dataHora(c.emitido_em) : ""}</Table.Td>
              <Table.Td>{c.referencia}</Table.Td><Table.Td>{c.amostras}</Table.Td><Table.Td>{c.resultados}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {aberto && (
        <Modal opened onClose={() => setAberto(null)} size="90%" title={`Certificado ${aberto.codigo}`}>
          <Group mb="sm"><Button size="xs" variant={verTabela ? "light" : "filled"} onClick={() => setVerTabela(false)}>QA/QC</Button><Button size="xs" variant={verTabela ? "filled" : "light"} onClick={() => setVerTabela(true)}>Todas as linhas do laudo</Button></Group>
          {verTabela ? <Resultados mina={mina} certificadoId={aberto.id} /> : <Qaqc id={aberto.id} />}
        </Modal>
      )}
    </Stack>
  );
}

function Qaqc({ id }: { id: string }) {
  const [limite, setLimite] = useState("20");
  const q = useQuery({ queryKey: ["qaqc", id, limite], queryFn: () => api<{ pares: { tipo: string; amostra: string; analito: string; original: number; repeticao: number; unidade: string; rpd: number; alerta: boolean }[]; alertas: number; padroes: string[]; brancos_acima_do_limite: { codigo: string; analito: string; valor: string; unidade: string }[]; observacao: string }>(`/certificados/${id}/qaqc?limite_rpd=${Number(limite) || 20}`) });
  if (!q.data) return <Loader size="sm" />;
  return (
    <Stack gap="xs">
      <Group align="flex-end">
        <TextInput label="Limite de diferença (RPD %)" w={200} value={limite} onChange={(e) => setLimite(e.currentTarget.value)} />
        <Badge color={q.data.alertas ? "orange" : "teal"} size="lg">{q.data.alertas} par(es) acima do limite</Badge>
      </Group>
      <Text size="xs" c="dimmed">Duplicatas (DUP) e replicatas (REP) do laboratório comparadas com a amostra original: RPD = |a − b| / média × 100. Padrões no laudo: {q.data.padroes.join(", ") || "nenhum"}. {q.data.observacao}</Text>
      <ScrollArea h={380}>
        <Table striped fz="xs" stickyHeader>
          <Table.Thead><Table.Tr><Table.Th>Tipo</Table.Th><Table.Th>Amostra</Table.Th><Table.Th>Analito</Table.Th><Table.Th>Original</Table.Th><Table.Th>Repetição</Table.Th><Table.Th>RPD %</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {q.data.pares.map((p, i) => (
              <Table.Tr key={i} bg={p.alerta ? "var(--mantine-color-orange-light)" : undefined}>
                <Table.Td>{p.tipo}</Table.Td><Table.Td>{p.amostra}</Table.Td><Table.Td>{p.analito}</Table.Td>
                <Table.Td>{p.original} {p.unidade}</Table.Td><Table.Td>{p.repeticao} {p.unidade}</Table.Td><Table.Td fw={p.alerta ? 700 : 400}>{p.rpd}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function Importar({ mina }: { mina: Mina }) {
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lab, setLab] = useState("SGS Geosol");
  const [cert, setCert] = useState("");
  const [fim, setFim] = useState<{ certificado: string; resultados: number; amostras_vinculadas: number; sem_vinculo: string[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const analisar = useMutation({
    mutationFn: (a: File) => enviarArquivos<Previa>(`/minas/${mina.id}/laudos`, {}, [a], "arquivo"),
    onSuccess: (p) => { setPrevia(p); setFim(null); setCert(""); }, onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao ler o laudo."),
  });
  const confirmar = useMutation({
    mutationFn: () => api<{ certificado: string; resultados: number; amostras_vinculadas: number; sem_vinculo: string[] }>(`/importacoes/${previa!.id}/confirmar-laudo`, { method: "POST", body: json({ laboratorio: lab, certificado: cert || null }) }),
    onSuccess: (r) => { setFim(r); setPrevia(null); qc.invalidateQueries(); notifications.show({ color: "teal", message: `Certificado ${r.certificado}: ${r.resultados} resultados importados.` }); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha na importação."),
  });
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">Laudo da SGS (.xls/.xlsx) ou planilha com uma coluna de amostra e colunas "Analito (unidade)". A prévia mostra o que será importado; nada é gravado antes da confirmação. O arquivo original fica guardado.</Text>
      {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}
      <FileButton accept=".xls,.xlsx,.csv,.txt" onChange={(a) => a && (setErro(null), analisar.mutate(a))}>
        {(props) => <Button w="fit-content" loading={analisar.isPending} {...props}>Escolher laudo</Button>}
      </FileButton>
      {previa && (
        <>
          <Paper withBorder p="sm">
            <Text fw={600}>{previa.nome_arquivo} · formato {previa.formato} · certificado {previa.certificado ?? "não informado"}{previa.emitido_em ? ` · emitido em ${dataHora(previa.emitido_em)}` : ""}</Text>
            <Text size="sm">{previa.projeto ? `Projeto ${previa.projeto} · ` : ""}{previa.referencia ?? ""}</Text>
            <Group gap={6} mt={4}>
              {Object.entries(previa.tipos).filter(([, n]) => n).map(([t, n]) => <Badge key={t} variant="outline">{t}: {n}</Badge>)}
              {Object.entries(previa.resumo).map(([s, n]) => <Badge key={s} color={SITUACAO[s].cor}>{SITUACAO[s].rotulo}: {n}</Badge>)}
            </Group>
            <Text size="xs" mt={4}>{previa.colunas.length} analitos: {previa.colunas.map((c) => `${c.analito} (${c.unidade}, ${c.metodo})${c.novo ? " ★" : ""}`).join(" · ")}</Text>
            <Text size="xs" c="dimmed">★ analito novo, será cadastrado na importação.</Text>
            {previa.certificado_ja_importado && <Alert color="red" mt="xs">Este certificado já foi importado.</Alert>}
            {previa.arquivo_ja_importado && <Alert color="yellow" mt="xs">Este mesmo arquivo já foi importado antes.</Alert>}
            {previa.erros_valor.length > 0 && <Alert color="red" mt="xs">{previa.erros_valor.length} valor(es) não reconhecidos (ex.: linha {previa.erros_valor[0].linha}, {previa.erros_valor[0].coluna}).</Alert>}
            {previa.resumo.nao_encontrada > 0 && <Alert color="orange" mt="xs">Resultados de amostras não cadastradas serão guardados sem vínculo e poderão ser ligados depois (aba Certificados).</Alert>}
          </Paper>
          <Group align="flex-end">
            <TextInput label="Laboratório" value={lab} onChange={(e) => setLab(e.currentTarget.value)} />
            {!previa.certificado && <TextInput label="Número do certificado" value={cert} onChange={(e) => setCert(e.currentTarget.value)} />}
            <Button loading={confirmar.isPending} disabled={previa.certificado_ja_importado} onClick={() => { setErro(null); confirmar.mutate(); }}>Confirmar importação</Button>
            <Button variant="subtle" onClick={() => { api(`/importacoes/${previa.id}`, { method: "DELETE" }).catch(() => undefined); setPrevia(null); }}>Descartar</Button>
          </Group>
          <ScrollArea h={320}>
            <Table striped fz="xs" stickyHeader>
              <Table.Thead><Table.Tr><Table.Th>Linha</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Código no laudo</Table.Th><Table.Th>Amostra</Table.Th><Table.Th>Situação</Table.Th><Table.Th>Valores</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {previa.linhas.map((l) => (
                  <Table.Tr key={l.linha}><Table.Td>{l.linha}</Table.Td><Table.Td>{l.tipo}</Table.Td><Table.Td>{l.codigo_laboratorio}</Table.Td><Table.Td>{l.codigo}</Table.Td>
                    <Table.Td><Badge size="xs" color={SITUACAO[l.situacao].cor}>{SITUACAO[l.situacao].rotulo}</Badge></Table.Td><Table.Td>{l.valores}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}
      {fim && (
        <Alert color="teal" title={`Certificado ${fim.certificado} importado`}>
          {fim.resultados} resultados; {fim.amostras_vinculadas} amostra(s) vinculada(s).
          {fim.sem_vinculo.length > 0 && <> Sem vínculo (controles do laboratório ou amostras não cadastradas): {fim.sem_vinculo.join(", ")}.</>}
        </Alert>
      )}
    </Stack>
  );
}
