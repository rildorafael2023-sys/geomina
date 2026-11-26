import { Alert, Anchor, Badge, Button, Card, FileButton, Group, Image, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, CATEGORIAS_DOC, dataCurta, dataHora, enviarArquivos, ErroApi, json, tamanhoLegivel, urlArquivo, type Documento } from "../../api/cliente";

interface Props {
  minaId: string;
  unidadeId?: string;
  mapeamentoId?: string;
  podeEnviar: boolean;
  categoriaInicial?: string;
  compacto?: boolean;
}

/** Lista, envio e visualização de croquis, fotos e outros documentos (reutilizado na ficha e nas unidades). */
export function PainelDocumentos({ minaId, unidadeId, mapeamentoId, podeEnviar, categoriaInicial = "foto", compacto = false }: Props) {
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const p = new URLSearchParams({ categoria });
  if (unidadeId) p.set("unidade_id", unidadeId);
  if (mapeamentoId) p.set("mapeamento_id", mapeamentoId);
  if (texto.trim()) p.set("texto", texto.trim());
  const docs = useQuery({ queryKey: ["documentos", minaId, p.toString()], queryFn: () => api<Documento[]>(`/minas/${minaId}/documentos?${p}`) });
  const enviar = useMutation({
    mutationFn: (arquivos: File[]) =>
      enviarArquivos<Documento[]>("/documentos", { categoria, mina_id: minaId, unidade_id: mapeamentoId ? null : unidadeId, mapeamento_id: mapeamentoId }, arquivos),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["documentos"] });
      notifications.show({ color: "teal", message: `${r.length} arquivo(s) enviado(s).` });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha no envio."),
  });
  const aceita = categoria === "foto" ? "image/jpeg,image/png,image/tiff" : categoria === "croqui" ? "application/pdf,image/jpeg,image/png,image/tiff" : undefined;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <SegmentedControl size="xs" value={categoria} onChange={setCategoria}
          data={[{ value: "foto", label: "Fotos" }, { value: "croqui", label: "Croquis" }, ...(compacto ? [] : Object.entries(CATEGORIAS_DOC).filter(([k]) => !["foto", "croqui"].includes(k)).map(([value, label]) => ({ value, label })))]} />
        {podeEnviar && (
          <Group gap={6}>
            <FileButton multiple accept={aceita} onChange={(f) => f.length && (setErro(null), enviar.mutate(f))}>
              {(props) => <Button size="xs" loading={enviar.isPending} {...props}>Enviar arquivos</Button>}
            </FileButton>
            {categoria === "foto" && (
              <FileButton accept="image/*" capture="environment" onChange={(f) => f && (setErro(null), enviar.mutate([f]))}>
                {(props) => <Button size="xs" variant="light" {...props}>Tirar foto</Button>}
              </FileButton>
            )}
          </Group>
        )}
      </Group>
      {!compacto && <TextInput size="xs" placeholder="Buscar por título, legenda ou identificador" value={texto} onChange={(e) => setTexto(e.currentTarget.value)} />}
      {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}
      {docs.isLoading ? <Loader size="sm" /> : !docs.data?.length ? (
        <Text size="sm" c="dimmed">Nenhum arquivo nesta categoria.</Text>
      ) : categoria === "foto" ? (
        <SimpleGrid cols={{ base: 2, sm: 3, md: compacto ? 3 : 5 }}>
          {docs.data.map((d) => (
            <Card key={d.id} withBorder p={4} style={{ cursor: "pointer" }} onClick={() => setAberto(d.id)}>
              <Miniatura doc={d} />
              <Text size="xs" truncate mt={4}>{d.legenda || d.titulo}</Text>
              <Text size="xs" c="dimmed">{d.data_documento ? dataCurta(d.data_documento) : "sem data"}</Text>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Table striped highlightOnHover>
          <Table.Tbody>
            {docs.data.map((d) => (
              <Table.Tr key={d.id} style={{ cursor: "pointer" }} onClick={() => setAberto(d.id)}>
                <Table.Td>{d.titulo}</Table.Td>
                <Table.Td fz="xs">{d.data_documento ? dataCurta(d.data_documento) : ""}</Table.Td>
                <Table.Td fz="xs">{d.versoes.at(-1)?.paginas ? `${d.versoes.at(-1)!.paginas} pág.` : d.versoes.at(-1)?.mime.split("/")[1]}</Table.Td>
                <Table.Td fz="xs">{d.versoes.length > 1 ? `v${d.versoes.length}` : ""}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {aberto && <DetalheDocumento id={aberto} podeEditar={podeEnviar} aoFechar={() => setAberto(null)} />}
    </Stack>
  );
}

function Miniatura({ doc }: { doc: Documento }) {
  const v = doc.versoes.at(-1)!;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let atual: string | null = null;
    urlArquivo(`/documentos/${doc.id}/versoes/${v.numero}/arquivo?tipo=miniatura`).then((u) => setUrl((atual = u))).catch(() => setUrl(null));
    return () => { if (atual) URL.revokeObjectURL(atual); };
  }, [doc.id, v.numero]);
  return url ? <Image src={url} h={110} fit="cover" radius="xs" alt={doc.legenda ?? doc.titulo} /> : <div style={{ height: 110, background: "var(--mantine-color-default-hover)" }} />;
}

function Visualizador({ doc, numero }: { doc: Documento; numero: number }) {
  const v = doc.versoes.find((x) => x.numero === numero)!;
  const [url, setUrl] = useState<string | null>(null);
  const tipo = v.mime === "image/tiff" ? "previa" : "original";
  useEffect(() => {
    let atual: string | null = null;
    urlArquivo(`/documentos/${doc.id}/versoes/${numero}/arquivo?tipo=${tipo}`).then((u) => setUrl((atual = u))).catch(() => setUrl(null));
    return () => { if (atual) URL.revokeObjectURL(atual); };
  }, [doc.id, numero, tipo]);
  if (!url) return <Loader size="sm" />;
  if (v.mime === "application/pdf") return <iframe title={doc.titulo} src={url} style={{ width: "100%", height: "70vh", border: 0 }} />;
  if (v.mime.startsWith("image/")) return <img src={url} alt={doc.legenda ?? doc.titulo} style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto" }} />;
  return <Text size="sm">Pré-visualização indisponível. <Anchor href={url} download={v.nome_original}>Baixar arquivo</Anchor></Text>;
}

function DetalheDocumento({ id, podeEditar, aoFechar }: { id: string; podeEditar: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["documento", id], queryFn: () => api<Documento>(`/documentos/${id}`) });
  const [numero, setNumero] = useState<number | null>(null);
  const [f, setF] = useState<{ titulo: string; legenda: string; identificador: string; descricao: string; data: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setF({ titulo: q.data.titulo, legenda: q.data.legenda ?? "", identificador: q.data.identificador ?? "", descricao: q.data.descricao ?? "", data: q.data.data_documento ?? "" });
  }, [q.data]);
  const atualizar = (d: Documento) => { qc.setQueryData(["documento", id], d); qc.invalidateQueries({ queryKey: ["documentos"] }); };
  const falha = (e: unknown) => setErro(e instanceof ErroApi ? e.message : "Falha na operação.");
  const salvar = useMutation({
    mutationFn: () => api<Documento>(`/documentos/${id}`, { method: "PATCH", body: json({ versao: q.data!.versao, titulo: f!.titulo, legenda: f!.legenda || null, identificador: f!.identificador || null, descricao: f!.descricao || null, data_documento: f!.data || null }) }),
    onSuccess: (d) => { atualizar(d); notifications.show({ color: "teal", message: "Dados salvos." }); }, onError: falha,
  });
  const versao = useMutation({
    mutationFn: (arq: File) => enviarArquivos<Documento>(`/documentos/${id}/versoes`, { motivo }, [arq], "arquivo"),
    onSuccess: (d) => { atualizar(d); setMotivo(""); setNumero(null); }, onError: falha,
  });
  const dividir = useMutation({
    mutationFn: () => api<Documento[]>(`/documentos/${id}/dividir`, { method: "POST" }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["documentos"] }); qc.invalidateQueries({ queryKey: ["documento", id] }); notifications.show({ color: "teal", message: `${r.length} páginas criadas como croquis separados.` }); }, onError: falha,
  });
  const arquivar = useMutation({
    mutationFn: () => api<Documento>(`/documentos/${id}`, { method: "PATCH", body: json({ versao: q.data!.versao, arquivado: !q.data!.arquivado }) }),
    onSuccess: (d) => { atualizar(d); aoFechar(); }, onError: falha,
  });
  const d = q.data;
  const atual = numero ?? d?.versoes.at(-1)?.numero ?? 1;
  return (
    <Modal opened onClose={aoFechar} size="xl" title={d ? `${CATEGORIAS_DOC[d.categoria]}: ${d.titulo}` : "Documento"}>
      {!d || !f ? <Loader /> : (
        <Stack gap="sm">
          {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}
          <Visualizador doc={d} numero={atual} />
          <Group gap={6}>
            {d.versoes.map((v) => (
              <Badge key={v.numero} variant={v.numero === atual ? "filled" : "light"} style={{ cursor: "pointer" }} onClick={() => setNumero(v.numero)} title={v.motivo ?? "versão original"}>
                v{v.numero} · {dataHora(v.criado_em)}
              </Badge>
            ))}
            <Text size="xs" c="dimmed">{d.versoes.find((v) => v.numero === atual)?.nome_original} · {tamanhoLegivel(d.versoes.find((v) => v.numero === atual)!.tamanho)}</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Por {d.autor} · vínculos: {d.vinculos.map((v) => v.rotulo).join(", ") || "nenhum"}
            {d.exif?.Model ? ` · câmera ${d.exif.Make ?? ""} ${d.exif.Model}` : ""}{d.exif?.gps_lat ? ` · GPS ${d.exif.gps_lat}, ${d.exif.gps_lon}` : ""}
          </Text>
          {podeEditar && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="Título" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.currentTarget.value })} />
                <TextInput type="date" label="Data" value={f.data} onChange={(e) => setF({ ...f, data: e.currentTarget.value })} />
                {d.categoria === "foto" && <TextInput label="Legenda" value={f.legenda} onChange={(e) => setF({ ...f, legenda: e.currentTarget.value })} />}
                {d.categoria === "foto" && <TextInput label="Identificação (ex.: F-001)" value={f.identificador} onChange={(e) => setF({ ...f, identificador: e.currentTarget.value })} />}
              </SimpleGrid>
              <Textarea label="Descrição" autosize minRows={1} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.currentTarget.value })} />
              <Group gap={6}>
                <Button size="xs" loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar dados</Button>
                {d.versoes.at(-1)!.mime === "application/pdf" && (d.versoes.at(-1)!.paginas ?? 0) > 1 && !d.origem_id && !d.paginas_separadas && (
                  <Button size="xs" variant="light" loading={dividir.isPending} onClick={() => { setErro(null); dividir.mutate(); }}>Separar em {d.versoes.at(-1)!.paginas} páginas</Button>
                )}
                <Button size="xs" variant="subtle" color="gray" onClick={() => arquivar.mutate()}>{d.arquivado ? "Desarquivar" : "Arquivar"}</Button>
              </Group>
              <Group gap={6} align="flex-end">
                <TextInput size="xs" label="Nova versão: motivo" placeholder="ex.: croqui redesenhado" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />
                <FileButton onChange={(a) => a && (setErro(null), versao.mutate(a))}>
                  {(props) => <Button size="xs" variant="light" disabled={motivo.trim().length < 3} loading={versao.isPending} {...props}>Enviar nova versão</Button>}
                </FileButton>
              </Group>
              <Text size="xs" c="dimmed">Versões anteriores nunca são apagadas; o arquivo original fica preservado.</Text>
            </>
          )}
        </Stack>
      )}
    </Modal>
  );
}
