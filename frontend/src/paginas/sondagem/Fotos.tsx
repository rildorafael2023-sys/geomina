import { Alert, Badge, Button, Checkbox, FileButton, Group, Loader, Modal, NavLink, Paper, Popover, ScrollArea, SegmentedControl, SimpleGrid, Slider, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, baixar, enviarArquivos } from "../../api/cliente";
import { corLitologia, m, teor } from "../../componentes/perfil";
import { Miniatura, VisorFoto } from "./comuns";
import { consultaPerfil, corMaterial, gravarLocal, lerLocal, nomeLito, useSondagem, type FotoP, type PerfilP } from "./tipos";

interface Caixas { caixas: { caixa: string; de: number; ate: number; com_foto: boolean }[]; sem_foto: string[]; fotos: number; a_conferir: number; fotografado_m: number; descrito_m: number }
interface Lida { arquivo: string; furo: string | null; caixa: string | null; de: number | null; ate: number | null; situacao: "ok" | "sem_intervalo" | "furo_nao_encontrado" }
type Vista = "caixa" | "furo" | "tabela";

const SITUACAO: Record<Lida["situacao"], { rotulo: string; cor: string }> = {
  ok: { rotulo: "pronta", cor: "teal" }, sem_intervalo: { rotulo: "sem De–Até (fica a conferir)", cor: "yellow" }, furo_nao_encontrado: { rotulo: "furo não encontrado", cor: "red" },
};

/** Fotos de testemunho: lista de furos, importação em lote pelo nome do arquivo, vistas por caixa / ao longo do furo / tabela. */
export function FotosTestemunho() {
  const { mina, furos, furo, setFuro, pode } = useSondagem();
  const [soCom, setSoCom] = useState(false);
  const [busca, setBusca] = useState("");
  const [vista, setVistaE] = useState<Vista>(() => lerLocal("geomina.sondagem.vistaFotos", "caixa"));
  const [tam, setTam] = useState(130);
  const [importar, setImportar] = useState(false);
  const [aberta, setAberta] = useState<FotoP | null>(null);
  const setVista = (v: Vista) => { setVistaE(v); gravarLocal("geomina.sondagem.vistaFotos", v); };
  const perfil = useQuery({ ...consultaPerfil(furo ?? ""), enabled: !!furo });
  const caixas = useQuery({ queryKey: ["log-furo", furo, "caixas"], queryFn: () => api<Caixas>(`/furos/${furo}/caixas`), enabled: !!furo });
  const lista = furos.filter((f) => (!soCom || f.fotos > 0) && (!busca.trim() || f.codigo.toLowerCase().includes(busca.trim().toLowerCase())));
  const p = perfil.data, c = caixas.data;

  return (
    <Group className="gm-lateral" align="flex-start" gap="sm" wrap="nowrap">
      <Paper withBorder p="xs" w={210} style={{ flexShrink: 0 }}>
        <TextInput size="xs" placeholder="Buscar furo" value={busca} onChange={(e) => setBusca(e.currentTarget.value)} mb={4} />
        <Checkbox size="xs" label="Só furos com fotos" checked={soCom} onChange={(e) => setSoCom(e.currentTarget.checked)} mb={6} />
        <ScrollArea.Autosize mah="70vh">
          {lista.map((f) => (
            <NavLink key={f.id} active={f.id === furo} py={3} onClick={() => setFuro(f.id)} label={<Text size="sm" fw={600}>{f.codigo}</Text>}
              description={`${m(f.profundidade_final)} m${f.area ? ` · ${f.area}` : ""}`} rightSection={<Badge size="sm" variant={f.fotos ? "filled" : "light"} color={f.fotos ? "blue" : "gray"}>{f.fotos}</Badge>} />
          ))}
          {!lista.length && <Text size="xs" c="dimmed">Nenhum furo.</Text>}
        </ScrollArea.Autosize>
      </Paper>
      <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            <Text fw={700} size="lg">{p?.furo.codigo ?? "—"}</Text>
            <SegmentedControl size="xs" value={vista} onChange={(v) => setVista(v as Vista)} data={[{ value: "caixa", label: "Por caixa" }, { value: "furo", label: "Ao longo do furo" }, { value: "tabela", label: "Tabela" }]} />
            <Group gap={4}><Text size="xs">Miniatura</Text><Slider w={100} size="sm" min={80} max={260} step={10} value={tam} onChange={setTam} label={null} /></Group>
          </Group>
          <Group gap="xs">
            {pode && <Button size="xs" onClick={() => setImportar(true)}>Importar fotos</Button>}
            <Button size="xs" variant="default" onClick={() => baixar(`/minas/${mina.id}/sondagem/fotos.csv?formato=imago`, "fotos_testemunho_imago.csv")}>Padrão Datarock/Imago</Button>
            <Button size="xs" variant="default" onClick={() => baixar(`/minas/${mina.id}/sondagem/fotos.csv?formato=leapfrog`, "fotos_testemunho_leapfrog.csv")}>Tabelas para o Leapfrog</Button>
            <ComoUsar />
          </Group>
        </Group>
        {(perfil.isLoading || caixas.isLoading) && <Loader size="sm" />}
        {p && c && (
          <>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
              <Numero rotulo="Fotos" valor={String(c.fotos)} />
              <Numero rotulo="Fotografado" valor={`${m(c.fotografado_m)} m`} detalhe={`de ${m(c.descrito_m)} m descritos`} />
              <Numero rotulo="Caixas sem foto" valor={String(c.sem_foto.length)} detalhe={`de ${c.caixas.length} caixas no log`} cor={c.sem_foto.length ? "orange" : undefined} />
              <Numero rotulo="A conferir" valor={String(c.a_conferir)} detalhe="fotos sem De–Até" cor={c.a_conferir ? "yellow" : undefined} />
            </SimpleGrid>
            <Faixa p={p} aoFoto={setAberta} />
            {c.sem_foto.length > 0 && (
              <Group gap={4}>
                <Text size="xs" fw={700}>Caixas do log sem foto:</Text>
                {c.caixas.filter((x) => !x.com_foto).map((x) => <Badge key={x.caixa} size="sm" variant="outline" color="orange">cx {x.caixa} · {m(x.de)}–{m(x.ate)} m</Badge>)}
              </Group>
            )}
            {!p.fotos.length ? (
              <Alert color="gray">Nenhuma foto deste furo. Use <b>Importar fotos</b>: o nome do arquivo diz o furo, a caixa e o intervalo (ex.: <code>F310_CX29_136,6-137,2.jpg</code>).</Alert>
            ) : vista === "caixa" ? <PorCaixa p={p} c={c} tam={tam} aoFoto={setAberta} />
              : vista === "furo" ? <AoLongo p={p} tam={tam} aoFoto={setAberta} />
                : <TabelaFotos p={p} aoFoto={setAberta} />}
          </>
        )}
      </Stack>
      {importar && <ImportarFotos minaId={mina.id} aoFechar={() => setImportar(false)} />}
      {aberta && <VisorFoto foto={aberta} aoFechar={() => setAberta(null)} />}
    </Group>
  );
}

function Numero({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <Paper withBorder p={8}>
      <Text size="xs" c="dimmed">{rotulo}</Text>
      <Text fw={700} size="xl" c={cor}>{valor}</Text>
      {detalhe && <Text size="xs" c="dimmed">{detalhe}</Text>}
    </Paper>
  );
}

/** Faixa horizontal do furo: litologia, fotos (em cima) e amostras (embaixo). */
function Faixa({ p, aoFoto }: { p: PerfilP; aoFoto: (f: FotoP) => void }) {
  const fim = Math.max(p.furo.profundidade_final, ...p.intervalos.map((i) => i.ate), 1);
  const W = 1000, x = (d: number) => (d / fim) * W;
  return (
    <svg viewBox={`0 0 ${W} 58`} width="100%" height={58} preserveAspectRatio="none" style={{ background: "#fff", border: "1px solid #dee2e6", borderRadius: 4 }}>
      {p.fotos.filter((f) => f.de != null && f.ate != null).map((f) => (
        <rect key={f.id} x={x(f.de!)} y={2} width={Math.max(2, x(f.ate!) - x(f.de!))} height={12} fill="#1c7ed6" opacity={0.8} style={{ cursor: "pointer" }} onClick={() => aoFoto(f)}><title>{f.titulo}</title></rect>
      ))}
      {p.intervalos.map((i) => (
        <rect key={i.id} x={x(i.de)} y={17} width={Math.max(0.5, x(i.ate) - x(i.de))} height={22} fill={corMaterial(i.material) ?? corLitologia(i.litologia, i.litologia_texto)} stroke="#495057" strokeWidth={0.3}>
          <title>{`${m(i.de)}–${m(i.ate)} m · ${nomeLito(i)}${i.caixa ? ` · cx ${i.caixa}` : ""}`}</title>
        </rect>
      ))}
      {p.amostras.map((a) => <rect key={a.id} x={x(a.de)} y={42} width={Math.max(1.5, x(a.ate) - x(a.de))} height={10} fill={a.com_resultado ? "#2f9e44" : "#fab005"}><title>{a.codigo}</title></rect>)}
      {[0, 0.25, 0.5, 0.75, 1].map((k) => <text key={k} x={Math.min(W - 2, Math.max(2, k * W))} y={57} fontSize={8} textAnchor={k === 0 ? "start" : k === 1 ? "end" : "middle"} fill="#495057">{m(Math.round(fim * k))} m</text>)}
    </svg>
  );
}

function PorCaixa({ p, c, tam, aoFoto }: { p: PerfilP; c: Caixas; tam: number; aoFoto: (f: FotoP) => void }) {
  const grupos = new Map<string, FotoP[]>();
  for (const f of p.fotos) {
    const k = f.caixa ?? c.caixas.find((x) => f.de != null && f.ate != null && f.de < x.ate && f.ate > x.de)?.caixa ?? "sem caixa";
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const num = (s: string) => Number(s.replace(/\D/g, "")) || 1e9;
  return (
    <Stack gap="xs">
      {[...grupos.entries()].sort((a, b) => num(a[0]) - num(b[0])).map(([k, fs]) => {
        const cx = c.caixas.find((x) => x.caixa === k);
        return (
          <Paper key={k} withBorder p="xs">
            <Group gap="xs" mb={6}>
              <Text fw={700}>{k === "sem caixa" ? "Sem caixa" : `Caixa ${k}`}</Text>
              {cx && <Text size="xs" c="dimmed">{m(cx.de)}–{m(cx.ate)} m · {nomeLito(p.intervalos.find((i) => i.caixa === k) ?? null)}</Text>}
              <Badge size="xs" variant="light">{fs.length} foto(s)</Badge>
            </Group>
            <Group gap={8}>{fs.map((f) => <div key={f.id} style={{ width: tam * 1.5 }}><Miniatura foto={f} altura={tam} aoAbrir={() => aoFoto(f)} /></div>)}</Group>
          </Paper>
        );
      })}
    </Stack>
  );
}

/** Cada foto na sua profundidade, ao lado do trecho descrito e da amostra. */
function AoLongo({ p, tam, aoFoto }: { p: PerfilP; tam: number; aoFoto: (f: FotoP) => void }) {
  const fotos = [...p.fotos].sort((a, b) => (a.de ?? 1e9) - (b.de ?? 1e9));
  return (
    <Stack gap={6}>
      {fotos.map((f) => {
        const ints = f.de == null ? [] : p.intervalos.filter((i) => i.ate > f.de! && i.de < f.ate!);
        const ams = f.de == null ? [] : p.amostras.filter((a) => a.ate > f.de! && a.de < f.ate!);
        return (
          <Paper key={f.id} withBorder p={6}>
            <Group align="flex-start" gap="sm" wrap="wrap">
              <Text fw={700} w={90} size="sm">{f.de != null ? `${m(f.de)}–${m(f.ate)} m` : "a conferir"}{f.caixa && <Text size="xs" c="dimmed">caixa {f.caixa}</Text>}</Text>
              <div style={{ width: tam * 1.8, flexShrink: 0 }}><Miniatura foto={f} altura={tam} aoAbrir={() => aoFoto(f)} rotulo={false} /></div>
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                {ints.map((i) => (
                  <Text key={i.id} size="xs"><span style={{ display: "inline-block", width: 10, height: 10, background: corLitologia(i.litologia, i.litologia_texto), marginRight: 4 }} />
                    <b>{m(i.de)}–{m(i.ate)} m · {nomeLito(i)}</b> {i.descricao}</Text>
                ))}
                {!ints.length && <Text size="xs" c="dimmed">Sem descrição neste trecho.</Text>}
                {ams.map((a) => {
                  const v = Object.entries(a.valores).slice(0, 6);
                  return <Text key={a.id} size="xs" c="blue.8"><b>{a.codigo}</b> {m(a.de)}–{m(a.ate)} m{v.length ? " · " + v.map(([k, x]) => `${k} ${teor(x.texto)}`).join(" · ") : ""}</Text>;
                })}
              </Stack>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}

function TabelaFotos({ p, aoFoto }: { p: PerfilP; aoFoto: (f: FotoP) => void }) {
  return (
    <Table striped highlightOnHover withTableBorder fz="xs">
      <Table.Thead><Table.Tr><Table.Th>Foto</Table.Th><Table.Th>De</Table.Th><Table.Th>Até</Table.Th><Table.Th>Caixa</Table.Th><Table.Th>Litologia</Table.Th><Table.Th>Legenda</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>
        {[...p.fotos].sort((a, b) => (a.de ?? 1e9) - (b.de ?? 1e9)).map((f) => (
          <Table.Tr key={f.id} style={{ cursor: "pointer" }} onClick={() => aoFoto(f)}>
            <Table.Td>{f.titulo}</Table.Td><Table.Td>{m(f.de)}</Table.Td><Table.Td>{m(f.ate)}</Table.Td><Table.Td>{f.caixa ?? ""}</Table.Td>
            <Table.Td>{f.de != null ? nomeLito(p.intervalos.find((i) => i.de <= f.de! && f.de! < i.ate) ?? null) : <Badge size="xs" color="yellow">a conferir</Badge>}</Table.Td>
            <Table.Td>{f.legenda ?? ""}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function ComoUsar() {
  return (
    <Popover width={360} withArrow shadow="md">
      <Popover.Target><Button size="xs" variant="subtle">Como usar</Button></Popover.Target>
      <Popover.Dropdown>
        <Stack gap={4}>
          <Text size="sm" fw={700}>Fotos de testemunho</Text>
          <Text size="xs">1. Dê às fotos nomes com furo, caixa e intervalo: <code>F310_CX29_136,6-137,2.jpg</code> ou <code>INA07 cx2 12,4-15,3.jpg</code>.</Text>
          <Text size="xs">2. Clique em <b>Importar fotos</b> e escolha várias de uma vez. O GeoMina lê os nomes e mostra o que entendeu antes de gravar.</Text>
          <Text size="xs">3. Sem De–Até no nome, a foto usa o intervalo da caixa descrito no log (coluna caixa). Sem caixa nem intervalo, fica “a conferir”.</Text>
          <Text size="xs">4. O arquivo original nunca é alterado: o visor só gira e amplia na tela.</Text>
          <Text size="xs">5. Exporte a tabela no padrão Datarock/Imago ou para o Leapfrog (hole_id, from, to, box, image).</Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function ImportarFotos({ minaId, aoFechar }: { minaId: string; aoFechar: () => void }) {
  const qc = useQueryClient();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [lidas, setLidas] = useState<Lida[] | null>(null);
  const conferir = useMutation({
    mutationFn: (fs: File[]) => enviarArquivos<{ lidas: Lida[] }>(`/minas/${minaId}/sondagem/fotos`, { conferir: "true" }, fs),
    onSuccess: (r) => setLidas(r.lidas),
    onError: (e: Error) => notifications.show({ color: "red", message: e.message }),
  });
  const gravar = useMutation({
    mutationFn: () => enviarArquivos<{ gravadas: number }>(`/minas/${minaId}/sondagem/fotos`, {}, arquivos),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["log-furo"] }); qc.invalidateQueries({ queryKey: ["furos"] }); notifications.show({ color: "teal", message: `${r.gravadas} foto(s) gravada(s).` }); aoFechar(); },
    onError: (e: Error) => notifications.show({ color: "red", message: e.message }),
  });
  const escolher = (fs: File[]) => { setArquivos(fs); setLidas(null); if (fs.length) conferir.mutate(fs); };
  const prontas = lidas?.filter((l) => l.situacao !== "furo_nao_encontrado").length ?? 0;
  return (
    <Modal opened onClose={aoFechar} title={<Text fw={700}>Importar fotos de testemunho</Text>} size="xl">
      <Stack gap="xs">
        <Text size="sm">Escolha as fotos (até 300 por vez). O nome de cada arquivo diz o furo, a caixa e o De–Até.</Text>
        <FileButton onChange={escolher} accept="image/*,application/pdf" multiple>
          {(props) => <Button {...props} variant="default" w={220}>Escolher fotos…</Button>}
        </FileButton>
        {conferir.isPending && <Loader size="sm" />}
        {lidas && (
          <ScrollArea h={340}>
            <Table fz="xs" withTableBorder striped>
              <Table.Thead><Table.Tr><Table.Th>Arquivo</Table.Th><Table.Th>Furo</Table.Th><Table.Th>Caixa</Table.Th><Table.Th>De</Table.Th><Table.Th>Até</Table.Th><Table.Th>Situação</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {lidas.map((l, k) => (
                  <Table.Tr key={k}>
                    <Table.Td>{l.arquivo}</Table.Td><Table.Td>{l.furo ?? "?"}</Table.Td><Table.Td>{l.caixa ?? ""}</Table.Td><Table.Td>{m(l.de)}</Table.Td><Table.Td>{m(l.ate)}</Table.Td>
                    <Table.Td><Badge size="xs" color={SITUACAO[l.situacao].cor}>{SITUACAO[l.situacao].rotulo}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={!prontas} loading={gravar.isPending} onClick={() => gravar.mutate()}>Gravar {prontas} foto(s)</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
