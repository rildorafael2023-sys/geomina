import { Alert, Badge, Button, Checkbox, Group, Loader, Menu, Modal, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, baixar, ErroApi, json, type Mina } from "../../api/cliente";
import { classe, coresClasses, limites, rotulos } from "../../geologia/classes";
import { valorCor, type Dados } from "./tipos";
import { PlantaGaleria } from "./PlantaGaleria";
import { parametrosGeo, useGeo, type Pagina } from "./estado";
import { ConfigTrack } from "./tracks/ConfigTrack";
import { NOME_GEO, trackAnalito, trackGeo, type TipoGeo, type Track, type TrackAnalito } from "./tracks/tipos";
import { TracksGaleria, type Amostra, type ClassesTrack } from "./tracks/TracksGaleria";

const UUID = /^[0-9a-f-]{36}$/i;
interface Layout { id: string; nome: string; config: { tracks: Track[]; analitos: string[] }; compartilhado: boolean; dono: string; meu: boolean }

/** Aba Galerias: tracks lado a lado (uma coluna por amostra na sequência da galeria), tabela, planta e layouts salvos. */
export function Galerias({ mina }: { mina: Mina }) {
  const s = useGeo();
  const p = parametrosGeo(s, { tamanho: "1" });
  const resumo = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`), placeholderData: (a) => a });
  const galerias = (resumo.data?.opcoes.galeria ?? []).filter((o) => o.valor !== "_nenhum");
  const sel = s.filtros.galeria ?? [];
  const id = sel.length === 1 ? sel[0] : null;
  const [invertida, setInvertida] = useState(false);

  // os analitos do topo e os tracks de analito andam juntos
  useEffect(() => {
    const tem = new Set(s.tracks.filter((t) => t.tipo === "analito").map((t) => (t as TrackAnalito).analito));
    const faltam = s.analitos.filter((a) => !tem.has(a));
    const sobram = [...tem].filter((a) => !s.analitos.includes(a));
    if (faltam.length || sobram.length)
      s.set({ tracks: [...s.tracks.filter((t) => t.tipo !== "analito" || s.analitos.includes((t as TrackAnalito).analito)), ...faltam.map(trackAnalito)] });
  }, [s.analitos]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = useMemo(() => {
    const q = new URLSearchParams({ analitos: s.analitos.join(","), regra_ld: s.regraLd, referencia: "amostras" });
    if (invertida) q.set("inverter", "true");
    const ids = (f: string) => (s.filtros[f as "litologia"] ?? []).filter((v) => UUID.test(v));
    for (const [f, a] of [["litologia", "litologias"], ["alteracao", "alteracoes"], ["mineralizacao", "mineralizacoes"], ["campanha", "campanhas"], ["tipo", "tipos"], ["responsavel", "responsaveis"]])
      if (ids(f).length) q.set(a, ids(f).join(","));
    if (s.dataDe) q.set("data_de", s.dataDe);
    if (s.dataAte) q.set("data_ate", s.dataAte);
    if (s.teor.analito && (s.teor.min || s.teor.max)) { q.set("teor_analito", s.teor.analito); if (s.teor.min) q.set("teor_min", s.teor.min); if (s.teor.max) q.set("teor_max", s.teor.max); }
    return q;
  }, [s.analitos, s.regraLd, s.filtros, s.dataDe, s.dataAte, s.teor, invertida]);
  const dados = useQuery({ queryKey: ["faixa", id, params.toString()], enabled: !!id, queryFn: () => api<Dados>(`/unidades/${id}/longitudinal?${params}`) });
  const amostras = (dados.data?.amostras ?? []) as Amostra[];

  const classes = useMemo(() => {
    const out: Record<string, ClassesTrack> = {};
    for (const t of s.tracks) {
      if (t.tipo !== "analito") continue;
      const a = t as TrackAnalito;
      const vals = amostras.map((x) => valorCor(x.valores[a.analito])).filter((v): v is number => v != null);
      const manuais = a.limites.split(/[;\s]+/).map((x) => Number(x.replace(",", "."))).filter((n) => Number.isFinite(n) && n !== 0);
      const lim = limites(vals, a.metodo, a.classes, manuais);
      out[t.id] = { lim, cores: coresClasses(lim.length + 1, a.paleta), unidade: dados.data?.series.find((x) => x.chave === a.analito)?.unidade ?? "",
        min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 1 };
    }
    return out;
  }, [amostras, s.tracks, dados.data]);

  const [janela, setJanela] = useState<[number, number]>([0, 0]);
  useEffect(() => { setJanela([0, Math.max(0, amostras.length - 1)]); }, [amostras.length, id, invertida]);
  const [trecho, setTrecho] = useState<[number, number] | null>(null);
  useEffect(() => setTrecho(null), [id, invertida]);
  const [config, setConfig] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // a amostra selecionada fora da janela traz a janela até ela
  useEffect(() => {
    const i = amostras.findIndex((a) => a.id === s.selecionado);
    if (i >= 0 && (i < janela[0] || i > janela[1])) {
      const n = janela[1] - janela[0];
      const a = Math.max(0, Math.min(amostras.length - 1 - n, i - Math.floor(n / 2)));
      setJanela([a, a + n]);
    }
  }, [s.selecionado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) {
    return (
      <Stack gap="xs" maw={760}>
        <Text fw={600}>Escolha uma galeria, travessa ou rampa</Text>
        <Text size="sm" c="dimmed">No painel à esquerda (Local) ou aqui. Os números são as amostras com os filtros atuais.</Text>
        <Group gap={6}>
          {galerias.map((g) => <Button key={g.valor} size="compact-sm" variant="default" onClick={() => s.definir("galeria", [g.valor])}>{g.rotulo} · {g.n}</Button>)}
          {!galerias.length && <Text size="sm" c="dimmed">Nenhuma amostra ligada a galerias com os filtros atuais.</Text>}
        </Group>
      </Stack>
    );
  }
  if (dados.isLoading) return <Loader size="sm" />;
  if (dados.error) return <Alert color="orange">{dados.error instanceof ErroApi ? dados.error.message : String(dados.error)}</Alert>;
  const d = dados.data;
  if (!d) return null;
  const idx = config ? s.tracks.findIndex((t) => t.id === config) : -1;
  const mudarTrack = (t: Track) => s.set({ tracks: s.tracks.map((x) => (x.id === t.id ? t : x)) });
  const geoFaltando = (Object.keys(NOME_GEO) as TipoGeo[]).filter((g) => !s.tracks.some((t) => t.tipo === g));
  const noTrecho = trecho ? amostras.slice(trecho[0], trecho[1] + 1) : [];
  const r = d.referencia;
  return (
    <Stack gap={6}>
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Group gap="xs">
          <Text fw={700}>{d.unidade.codigo} — {d.unidade.nome}</Text>
          <Text size="xs" c="dimmed">{amostras.length} amostras em {r.pontos} pontos · início: {r.inicio}</Text>
        </Group>
        <Group gap={6}>
          <Layouts mina={mina} />
          <Menu position="bottom-end" withinPortal>
            <Menu.Target><Button size="compact-sm" variant="default">+ Track</Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Geologia e amostras</Menu.Label>
              {geoFaltando.map((g) => <Menu.Item key={g} onClick={() => s.set({ tracks: [...s.tracks, trackGeo(g)] })}>{NOME_GEO[g]}</Menu.Item>)}
              {!geoFaltando.length && <Menu.Item disabled>todos já estão na tela</Menu.Item>}
              <Menu.Label>Analitos</Menu.Label>
              <Menu.Item disabled>Escolha no campo "Analitos" do topo</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button size="compact-sm" variant="default" onClick={() => setInvertida((x) => !x)}>Inverter início ⇄ fim</Button>
          <Button size="compact-sm" variant="default" onClick={() => setJanela([0, Math.max(0, amostras.length - 1)])} disabled={janela[0] === 0 && janela[1] === amostras.length - 1}>Ver todas</Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target><Button size="compact-sm" variant="default">Exportar</Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => baixar(`/unidades/${id}/longitudinal.csv?${params}`, `teores_${d.unidade.codigo}.csv`)}>Tabela da galeria (CSV)</Menu.Item>
              <Menu.Item onClick={() => svg.current && baixarSvg(svg.current, `tracks_${d.unidade.codigo}`, "svg")}>Tracks (SVG) — colunas visíveis</Menu.Item>
              <Menu.Item onClick={() => svg.current && baixarSvg(svg.current, `tracks_${d.unidade.codigo}`, "png")}>Tracks (PNG) — colunas visíveis</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {r.irregular && <Alert color="orange" p={6}><Text size="xs">As amostras desta unidade não seguem uma linha única (ramos diferentes juntos?): a sequência das colunas pode não acompanhar a galeria. Separe cada ramo em uma unidade própria.</Text></Alert>}
      {d.avisos.map((a) => <Alert key={a} color="yellow" p={6}><Text size="xs">{a}</Text></Alert>)}
      {!amostras.length ? <Text c="dimmed" size="sm">Nenhuma amostra com coordenadas nesta unidade (com os filtros atuais).</Text> : (
        <>
          <div style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 4 }}>
            <TracksGaleria ref={svg} amostras={amostras} tracks={s.tracks} classes={classes} janela={janela} aoJanela={setJanela}
              selecionado={s.selecionado} aoSelecionar={(x) => s.set({ selecionado: x })} trecho={trecho} aoTrecho={setTrecho} aoConfigurar={setConfig} />
          </div>
          <Group justify="space-between" gap="xs">
            <Text size="xs" c="dimmed">Colunas {janela[0] + 1}–{janela[1] + 1} de {amostras.length}. Roda do mouse: zoom · arrastar: deslocar · Shift+arrastar: selecionar trecho · clique: amostra · ⚙: configurar track</Text>
            <LegendaTracks tracks={s.tracks} classes={classes} />
          </Group>
          {trecho && (
            <Group gap="xs" p={6} style={{ background: "var(--mantine-color-yellow-0)", borderRadius: 4 }}>
              <Badge color="yellow">Trecho selecionado: {noTrecho.length} amostra(s), pontos {noTrecho[0]?.ponto}–{noTrecho[noTrecho.length - 1]?.ponto}</Badge>
              <Button size="compact-xs" variant="light" onClick={() => setJanela(trecho)}>Ampliar o trecho</Button>
              <Button size="compact-xs" variant="light" onClick={() => exportarTrecho(noTrecho, s.tracks, d.unidade.codigo)}>Exportar o trecho (CSV)</Button>
              <Button size="compact-xs" variant="subtle" onClick={() => setTrecho(null)}>Limpar seleção</Button>
            </Group>
          )}
          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="xs">
            <TabelaGaleria amostras={amostras} tracks={s.tracks} classes={classes} selecionado={s.selecionado} aoSelecionar={(x) => s.set({ selecionado: x })} trecho={trecho} />
            <PlantaGaleria mina={mina} amostras={amostras} tracks={s.tracks} classes={classes} selecionado={s.selecionado} aoSelecionar={(x) => s.set({ selecionado: x })} />
          </SimpleGrid>
        </>
      )}
      {config && idx >= 0 && (
        <ConfigTrack track={s.tracks[idx]} indice={idx} total={s.tracks.length} mudar={mudarTrack} fechar={() => setConfig(null)}
          mover={(dlt) => { const t = [...s.tracks]; const [x] = t.splice(idx, 1); t.splice(idx + dlt, 0, x); s.set({ tracks: t }); }}
          remover={() => { const t = s.tracks[idx]; s.set({ tracks: s.tracks.filter((x) => x.id !== t.id), ...(t.tipo === "analito" ? { analitos: s.analitos.filter((a) => a !== (t as TrackAnalito).analito) } : {}) }); }} />
      )}
    </Stack>
  );
}

function LegendaTracks({ tracks, classes }: { tracks: Track[]; classes: Record<string, ClassesTrack> }) {
  return (
    <Group gap="md" data-testid="legenda">
      {tracks.filter((t) => t.tipo === "analito").map((t) => {
        const c = classes[t.id];
        if (!c) return null;
        return (
          <Group key={t.id} gap={4} wrap="nowrap">
            <Text size="xs" fw={700}>{(t as TrackAnalito).analito}</Text>
            {rotulos(c.lim).map((rt, k) => <Group key={rt} gap={2} wrap="nowrap"><span style={{ width: 12, height: 10, background: c.cores[k], border: "1px solid #aaa", display: "inline-block" }} /><Text size="10px">{rt}</Text></Group>)}
          </Group>
        );
      })}
    </Group>
  );
}

/** Tabela integrada: mesma sequência dos tracks, ordenável; clique seleciona (e destaca nos tracks e na planta). */
function TabelaGaleria({ amostras, tracks, classes, selecionado, aoSelecionar, trecho }: {
  amostras: Amostra[]; tracks: Track[]; classes: Record<string, ClassesTrack>; selecionado: string | null; aoSelecionar: (id: string) => void; trecho: [number, number] | null;
}) {
  const an = tracks.filter((t) => t.tipo === "analito") as TrackAnalito[];
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean }>({ col: "seq", asc: true });
  const [colunas, setColunas] = useState({ secao: true, litologia: true, alteracao: false, mineralizacao: false, data: false });
  const linhas = amostras.map((a, i) => ({ a, i }));
  const valor = (x: { a: Amostra; i: number }, c: string): string | number => {
    if (c === "seq") return x.i;
    if (c === "codigo") return x.a.codigo;
    if (c === "litologia") return x.a.litologia?.nome ?? "";
    const v = x.a.valores[c];
    return v?.y ?? -Infinity;
  };
  linhas.sort((p, q) => { const a = valor(p, ordem.col), b = valor(q, ordem.col); const r = a < b ? -1 : a > b ? 1 : 0; return ordem.asc ? r : -r; });
  const th = (c: string, rot: string, dir?: "right") => (
    <Table.Th ta={dir} style={{ cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => setOrdem((o) => ({ col: c, asc: o.col === c ? !o.asc : true }))}>{rot}{ordem.col === c ? (ordem.asc ? " ▲" : " ▼") : ""}</Table.Th>
  );
  const linhaSel = useRef<HTMLTableRowElement>(null);
  useEffect(() => { linhaSel.current?.scrollIntoView({ block: "nearest" }); }, [selecionado]);
  return (
    <div>
      <Group justify="space-between" mb={2}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">Tabela</Text>
        <Menu withinPortal closeOnItemClick={false}>
          <Menu.Target><Button size="compact-xs" variant="subtle">Colunas</Button></Menu.Target>
          <Menu.Dropdown>
            {(Object.keys(colunas) as (keyof typeof colunas)[]).map((k) => (
              <Menu.Item key={k}><Checkbox size="xs" label={{ secao: "Seção", litologia: "Litologia", alteracao: "Alteração", mineralizacao: "Mineralização", data: "Data" }[k]} checked={colunas[k]} onChange={(e) => setColunas({ ...colunas, [k]: e.currentTarget.checked })} /></Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>
      <ScrollArea h={330} type="auto" offsetScrollbars>
        <Table fz={11} verticalSpacing={1} horizontalSpacing={5} striped highlightOnHover stickyHeader withTableBorder data-testid="tabela-galeria">
          <Table.Thead>
            <Table.Tr>
              {th("seq", "#")}{th("codigo", "Amostra")}
              {colunas.secao && <Table.Th>Seção</Table.Th>}{colunas.data && <Table.Th>Data</Table.Th>}
              {colunas.litologia && th("litologia", "Litologia")}{colunas.alteracao && <Table.Th>Alteração</Table.Th>}{colunas.mineralizacao && <Table.Th>Mineralização</Table.Th>}
              {an.map((t) => th(t.analito, `${t.analito} ${classes[t.id]?.unidade ?? ""}`, "right"))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {linhas.map(({ a, i }) => {
              const sel = a.id === selecionado, noTrecho = trecho && i >= trecho[0] && i <= trecho[1];
              return (
                <Table.Tr key={a.id} ref={sel ? linhaSel : undefined} onClick={() => aoSelecionar(a.id)} style={{ cursor: "pointer" }} data-amostra={a.codigo}
                  bg={sel ? "var(--mantine-color-blue-1)" : noTrecho ? "var(--mantine-color-yellow-0)" : undefined}>
                  <Table.Td c="dimmed">{a.ponto}</Table.Td><Table.Td fw={600} style={{ whiteSpace: "nowrap" }}>{a.codigo}</Table.Td>
                  {colunas.secao && <Table.Td>{a.secao_de_m != null ? `${a.secao_de_m}–${a.secao_ate_m}` : ""}</Table.Td>}
                  {colunas.data && <Table.Td>{a.data ? new Date(a.data + "T00:00").toLocaleDateString("pt-BR") : ""}</Table.Td>}
                  {colunas.litologia && <Table.Td style={{ whiteSpace: "nowrap" }}>{a.litologia?.nome ?? ""}</Table.Td>}
                  {colunas.alteracao && <Table.Td>{a.alteracao?.nome ?? ""}</Table.Td>}
                  {colunas.mineralizacao && <Table.Td>{a.mineralizacao?.nome ?? ""}</Table.Td>}
                  {an.map((t) => {
                    const v = a.valores[t.analito], c = classes[t.id];
                    const cor = v?.y != null && c ? c.cores[classe(v.y, c.lim)] : null;
                    return <Table.Td key={t.id} ta="right" style={{ whiteSpace: "nowrap" }}>{cor && <span style={{ display: "inline-block", width: 7, height: 7, background: cor, marginRight: 4 }} />}<span style={{ color: v && v.situacao !== "medido" ? "#868e96" : undefined }}>{v?.texto ?? "—"}</span></Table.Td>;
                  })}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </div>
  );
}

/** Layouts salvos: tracks e analitos reutilizáveis em outras galerias (os analitos sem dados aparecem vazios). */
function Layouts({ mina }: { mina: Mina }) {
  const qc = useQueryClient();
  const s = useGeo();
  const q = useQuery({ queryKey: ["layouts", mina.id], queryFn: () => api<Layout[]>(`/minas/${mina.id}/layouts?tipo=galeria`) });
  const [salvar, setSalvar] = useState(false);
  const [nome, setNome] = useState("");
  const [comp, setComp] = useState(false);
  const grava = useMutation({
    mutationFn: () => api<Layout>(`/minas/${mina.id}/layouts`, { method: "POST", body: json({ nome, tipo: "galeria", config: { tracks: s.tracks, analitos: s.analitos }, compartilhado: comp }) }),
    onSuccess: (l) => { qc.invalidateQueries({ queryKey: ["layouts"] }); setSalvar(false); notifications.show({ color: "teal", message: `Layout "${l.nome}" salvo.` }); },
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  const apaga = useMutation({ mutationFn: (id: string) => api(`/layouts/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["layouts"] }) });
  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target><Button size="compact-sm" variant="default">Layouts</Button></Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => { setNome(""); setSalvar(true); }}>Salvar o layout atual…</Menu.Item>
          {(q.data ?? []).length > 0 && <Menu.Divider />}
          {(q.data ?? []).map((l) => (
            <Menu.Item key={l.id} onClick={() => s.set({ tracks: l.config.tracks, analitos: l.config.analitos })}
              rightSection={l.meu ? <Text size="xs" c="red" onClick={(e) => { e.stopPropagation(); apaga.mutate(l.id); }}>excluir</Text> : <Text size="xs" c="dimmed">{l.dono}</Text>}>
              {l.nome}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {salvar && (
        <Modal opened onClose={() => setSalvar(false)} title="Salvar layout" size="sm">
          <Stack gap="xs">
            <TextInput label="Nome" placeholder="ex.: Travessa — Cr/V/Be/MgO/K2O" value={nome} onChange={(e) => setNome(e.currentTarget.value)} data-autofocus />
            <Text size="xs" c="dimmed">Guarda os tracks (ordem, representação, escalas, classes, cores) e os analitos. Pode ser aplicado em qualquer galeria.</Text>
            <Checkbox label="Compartilhar com os outros usuários" checked={comp} onChange={(e) => setComp(e.currentTarget.checked)} />
            <Button disabled={!nome.trim()} loading={grava.isPending} onClick={() => grava.mutate()}>Salvar</Button>
          </Stack>
        </Modal>
      )}
    </>
  );
}

function exportarTrecho(amostras: Amostra[], tracks: Track[], unidade: string) {
  const an = tracks.filter((t) => t.tipo === "analito").map((t) => (t as TrackAnalito).analito);
  const linhas = [["ponto", "amostra", "secao", "litologia", ...an].join(";"),
    ...amostras.map((a) => [a.ponto, a.codigo, a.secao_de_m != null ? `${a.secao_de_m}-${a.secao_ate_m}` : "", a.litologia?.nome ?? "", ...an.map((x) => a.valores[x]?.texto ?? "")].join(";"))];
  const b = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(b), l = document.createElement("a");
  l.href = u; l.download = `trecho_${unidade}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export async function baixarSvg(svg: SVGSVGElement, nome: string, formato: "svg" | "png") {
  const texto = new XMLSerializer().serializeToString(svg);
  const blobSvg = new Blob([texto], { type: "image/svg+xml;charset=utf-8" });
  const salvar = (b: Blob, ext: string) => { const u = URL.createObjectURL(b); const l = document.createElement("a"); l.href = u; l.download = `${nome}.${ext}`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  if (formato === "svg") return salvar(blobSvg, "svg");
  const img = new Image();
  const url = URL.createObjectURL(blobSvg);
  await new Promise((ok, erro) => { img.onload = ok; img.onerror = erro; img.src = url; });
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value;
  const cv = document.createElement("canvas");
  cv.width = w * 2; cv.height = h * 2;
  const ctx = cv.getContext("2d")!;
  ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  cv.toBlob((b) => b && salvar(b, "png"), "image/png");
}
