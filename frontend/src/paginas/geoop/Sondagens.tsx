import { Alert, Badge, Button, Checkbox, FileInput, Group, Loader, Menu, Modal, NumberInput, ScrollArea, Select, SimpleGrid, Stack, Table, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, ErroApi, json, type Eu, type Mina } from "../../api/cliente";
import { classe, coresClasses, limites } from "../../geologia/classes";
import { baixarSvg } from "./Galerias";
import { useGeo } from "./estado";
import { ConfigTrack } from "./tracks/ConfigTrack";
import { PerfilFuro, type IntervaloP, type Perfil } from "./tracks/PerfilFuro";
import { NOME_GEO, trackAnalito, trackGeo, type TipoGeo, type TrackAnalito } from "./tracks/tipos";
import type { ClassesTrack } from "./tracks/TracksGaleria";

interface FuroL { id: string; codigo: string; projeto: string | null; area: string | null; profundidade_final: number; azimute: number | null; inclinacao: number | null; surveys: number; trajetoria: "real" | "estimada"; intervalos: number; amostras: number; amostras_com_resultado: number; data_inicio: string | null }
const GEO_FURO: TipoGeo[] = ["litologia", "alteracao", "mineralizacao", "estruturas", "amostras", "descricao"];

export function Sondagens({ mina, eu }: { mina: Mina; eu: Eu }) {
  const s = useGeo();
  const furos = useQuery({ queryKey: ["furos", mina.id], queryFn: () => api<FuroL[]>(`/minas/${mina.id}/furos`) });
  const [importar, setImportar] = useState(false);
  const [intervalo, setIntervalo] = useState<{ furo: string; i: IntervaloP } | null>(null);
  const [config, setConfig] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<[number, number] | null>(null);
  const [altura, setAltura] = useState(620);
  const svgs = useRef<Record<string, SVGSVGElement | null>>({});

  // analitos do topo ↔ tracks de analito do perfil
  useEffect(() => {
    const tem = new Set(s.tracksFuro.filter((t) => t.tipo === "analito").map((t) => (t as TrackAnalito).analito));
    const faltam = s.analitos.filter((a) => !tem.has(a));
    if (faltam.length || [...tem].some((a) => !s.analitos.includes(a)))
      s.set({ tracksFuro: [...s.tracksFuro.filter((t) => t.tipo !== "analito" || s.analitos.includes((t as TrackAnalito).analito)), ...faltam.map(trackAnalito)] });
  }, [s.analitos]); // eslint-disable-line react-hooks/exhaustive-deps

  const perfis = useQueries({
    queries: s.furos.map((id) => ({ queryKey: ["perfil", id, s.analitos.join(","), s.regraLd], queryFn: () => api<Perfil>(`/furos/${id}/perfil?analitos=${s.analitos.join(",")}&regra_ld=${s.regraLd}`) })),
  });
  const dados = perfis.map((q) => q.data).filter((d): d is Perfil => !!d);
  const profMax = Math.max(1, ...dados.map((d) => d.furo.profundidade_final));
  const [faixa, setFaixa] = useState<[number, number]>([0, 100]);
  useEffect(() => { setFaixa([0, profMax]); setSelecao(null); }, [profMax, s.furos.join(",")]);

  // classes comuns a todos os furos mostrados (mesma cor = mesmo teor)
  const classes = useMemo(() => {
    const out: Record<string, ClassesTrack> = {};
    for (const t of s.tracksFuro) {
      if (t.tipo !== "analito") continue;
      const a = t as TrackAnalito;
      const vals = dados.flatMap((d) => d.amostras.map((x) => x.valores[a.analito]?.y)).filter((v): v is number => v != null);
      const manuais = a.limites.split(/[;\s]+/).map((x) => Number(x.replace(",", "."))).filter((n) => Number.isFinite(n) && n !== 0);
      const lim = limites(vals, a.metodo, a.classes, manuais);
      out[t.id] = { lim, cores: coresClasses(lim.length + 1, a.paleta), unidade: dados.find((d) => d.unidades[a.analito])?.unidades[a.analito] ?? "",
        min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 1 };
    }
    return out;
  }, [dados, s.tracksFuro]);

  const lista = furos.data ?? [];
  const idx = config ? s.tracksFuro.findIndex((t) => t.id === config) : -1;
  const geoFaltando = GEO_FURO.filter((g) => !s.tracksFuro.some((t) => t.tipo === g));
  const amostrasSel = selecao ? dados.flatMap((d) => d.amostras.filter((a) => a.ate > selecao[0] && a.de < selecao[1]).map((a) => ({ furo: d.furo.codigo, a }))) : [];
  return (
    <Stack gap={6}>
      <Group justify="space-between" gap="xs">
        <Text fw={700}>Sondagens {lista.length > 0 && <Text span c="dimmed" size="sm">· {lista.length} furo(s)</Text>}</Text>
        <Group gap={6}>
          {eu.permissoes.includes("sondagem:importar") && <Button size="compact-sm" onClick={() => setImportar(true)}>Importar sondagem…</Button>}
          {s.furos.length > 0 && (
            <>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target><Button size="compact-sm" variant="default">+ Track</Button></Menu.Target>
                <Menu.Dropdown>
                  {geoFaltando.map((g) => <Menu.Item key={g} onClick={() => s.set({ tracksFuro: [...s.tracksFuro, trackGeo(g)] })}>{NOME_GEO[g]}</Menu.Item>)}
                  {!geoFaltando.length && <Menu.Item disabled>todos já estão na tela</Menu.Item>}
                  <Menu.Item disabled>Analitos: escolha no topo</Menu.Item>
                </Menu.Dropdown>
              </Menu>
              <Button size="compact-sm" variant="default" onClick={() => setFaixa([0, profMax])}>Furo inteiro</Button>
              <Select size="xs" w={110} allowDeselect={false} value={String(altura)} onChange={(v) => setAltura(Number(v))} aria-label="Altura do perfil"
                data={[{ value: "420", label: "Baixo" }, { value: "620", label: "Médio" }, { value: "900", label: "Alto" }]} />
              <Menu position="bottom-end" withinPortal>
                <Menu.Target><Button size="compact-sm" variant="default">Exportar</Button></Menu.Target>
                <Menu.Dropdown>
                  {dados.map((d) => <Menu.Item key={d.furo.id} onClick={() => svgs.current[d.furo.id] && baixarSvg(svgs.current[d.furo.id]!, `perfil_${d.furo.codigo}`, "svg")}>Perfil {d.furo.codigo} (SVG)</Menu.Item>)}
                  {dados.map((d) => <Menu.Item key={"p" + d.furo.id} onClick={() => svgs.current[d.furo.id] && baixarSvg(svgs.current[d.furo.id]!, `perfil_${d.furo.codigo}`, "png")}>Perfil {d.furo.codigo} (PNG)</Menu.Item>)}
                  <Menu.Item onClick={() => exportarCsv(dados, s.analitos)}>Intervalos e resultados (CSV)</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          )}
        </Group>
      </Group>
      {furos.isLoading ? <Loader size="sm" /> : !lista.length ? (
        <Alert color="gray">Nenhum furo cadastrado. Use <b>Importar sondagem…</b> com os arquivos de collar, survey, geologia e amostras (CSV ou Excel).</Alert>
      ) : (
        <ScrollArea.Autosize mah={170} type="auto">
          <Table fz={11} verticalSpacing={1} striped highlightOnHover withTableBorder data-testid="lista-furos">
            <Table.Thead><Table.Tr><Table.Th w={28} /><Table.Th>Furo</Table.Th><Table.Th>Projeto / área</Table.Th><Table.Th ta="right">Prof. (m)</Table.Th><Table.Th>Az / Inc</Table.Th><Table.Th>Trajetória</Table.Th><Table.Th ta="right">Intervalos</Table.Th><Table.Th ta="right">Amostras (c/ resultado)</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {lista.map((f) => (
                <Table.Tr key={f.id} style={{ cursor: "pointer" }} onClick={() => s.set({ furos: s.furos.includes(f.id) ? s.furos.filter((x) => x !== f.id) : [...s.furos, f.id] })} data-furo={f.codigo}>
                  <Table.Td><Checkbox size="xs" checked={s.furos.includes(f.id)} readOnly aria-label={`Mostrar ${f.codigo}`} /></Table.Td>
                  <Table.Td fw={600}>{f.codigo}</Table.Td><Table.Td>{[f.projeto, f.area].filter(Boolean).join(" · ")}</Table.Td>
                  <Table.Td ta="right">{f.profundidade_final}</Table.Td><Table.Td>{f.azimute ?? "—"} / {f.inclinacao ?? "—"}</Table.Td>
                  <Table.Td>{f.trajetoria === "real" ? <Badge size="xs" color="teal" variant="light">survey ({f.surveys})</Badge> : <Badge size="xs" color="orange" variant="light">estimada</Badge>}</Table.Td>
                  <Table.Td ta="right">{f.intervalos}</Table.Td><Table.Td ta="right">{f.amostras} ({f.amostras_com_resultado})</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      )}
      {s.furos.length > 0 && (
        <>
          {/* linha de altura fixa: a seleção aparece aqui sem deslocar os perfis durante o arraste */}
          <Group gap="xs" mih={26} wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Profundidade {faixa[0].toFixed(1)}–{faixa[1].toFixed(1)} m (mesma escala para todos os furos). Roda do mouse: zoom · arrastar: deslocar · Shift+arrastar: selecionar intervalo · clique: amostra/intervalo · ⚙: configurar track</Text>
            {selecao && (
              <>
                <Badge color="yellow" style={{ flexShrink: 0 }}>Intervalo {selecao[0].toFixed(1)}–{selecao[1].toFixed(1)} m: {amostrasSel.length} amostra(s)</Badge>
                <Button size="compact-xs" variant="light" onClick={() => setFaixa(selecao)}>Ampliar</Button>
                <Button size="compact-xs" variant="subtle" onClick={() => setSelecao(null)}>Limpar</Button>
              </>
            )}
          </Group>
          <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: "auto" }}>
            {perfis.map((q, k) => {
              if (q.isLoading) return <Loader key={k} size="sm" />;
              if (q.error) return <Alert key={k} color="orange">{q.error instanceof ErroApi ? q.error.message : String(q.error)}</Alert>;
              const d = q.data!;
              return (
                <Stack key={d.furo.id} gap={4} style={{ flexShrink: 0 }}>
                  <Group gap={6}>
                    <Text fw={700} size="sm">{d.furo.codigo}</Text>
                    {d.trajetoria?.estimada ? <Tooltip label={d.trajetoria.motivo}><Badge size="xs" color="orange">trajetória estimada</Badge></Tooltip> : d.trajetoria && <Badge size="xs" color="teal" variant="light">survey</Badge>}
                    {d.sem_profundidade.length > 0 && <Tooltip label={d.sem_profundidade.join(", ")}><Badge size="xs" color="gray">{d.sem_profundidade.length} sem profundidade</Badge></Tooltip>}
                  </Group>
                  <PerfilFuro ref={(el) => { svgs.current[d.furo.id] = el; }} p={d} tracks={s.tracksFuro} classes={classes} faixa={faixa} aoFaixa={setFaixa} altura={altura}
                    selecionado={s.selecionado} aoSelecionar={(id) => s.set({ selecionado: id })} aoIntervalo={(i) => setIntervalo({ furo: d.furo.codigo, i })}
                    selecao={selecao} aoSelecao={setSelecao} aoConfigurar={setConfig} />
                </Stack>
              );
            })}
            {dados.length > 0 && <Trajetorias dados={dados} analito={s.tracksFuro.find((t) => t.tipo === "analito") as TrackAnalito | undefined} classes={classes} selecionado={s.selecionado} aoSelecionar={(id) => s.set({ selecionado: id })} />}
          </Group>
        </>
      )}
      {intervalo && (
        <Modal opened onClose={() => setIntervalo(null)} title={`${intervalo.furo}: ${intervalo.i.de}–${intervalo.i.ate} m`} size="md">
          <Stack gap={4}>
            {(["litologia", "alteracao", "mineralizacao"] as const).map((c) => (
              <Group key={c} gap={6}><Text size="sm" c="dimmed" w={110}>{NOME_GEO[c]}</Text><Text size="sm">{intervalo.i[c]?.nome ?? (intervalo.i.atributos?.[`${c}_original`] ? `"${intervalo.i.atributos[`${c}_original`]}" (fora do dicionário)` : "—")}</Text></Group>
            ))}
            <Group gap={6}><Text size="sm" c="dimmed" w={110}>Estruturas</Text><Text size="sm">{intervalo.i.estruturas ?? "—"}</Text></Group>
            <Group gap={6} align="flex-start"><Text size="sm" c="dimmed" w={110}>Descrição</Text><Text size="sm" style={{ flex: 1 }}>{intervalo.i.descricao ?? "—"}</Text></Group>
            {intervalo.i.observacoes && <Group gap={6}><Text size="sm" c="dimmed" w={110}>Observações</Text><Text size="sm">{intervalo.i.observacoes}</Text></Group>}
            <Text size="xs" c="dimmed" mt={6}>Amostras neste intervalo: {dados.find((d) => d.furo.codigo === intervalo.furo)?.amostras.filter((a) => a.ate > intervalo.i.de && a.de < intervalo.i.ate).map((a) => a.codigo).join(", ") || "nenhuma"}</Text>
          </Stack>
        </Modal>
      )}
      {config && idx >= 0 && (
        <ConfigTrack track={s.tracksFuro[idx]} indice={idx} total={s.tracksFuro.length} fechar={() => setConfig(null)}
          mudar={(t) => s.set({ tracksFuro: s.tracksFuro.map((x) => (x.id === t.id ? t : x)) })}
          mover={(dl) => { const t = [...s.tracksFuro]; const [x] = t.splice(idx, 1); t.splice(idx + dl, 0, x); s.set({ tracksFuro: t }); }}
          remover={() => { const t = s.tracksFuro[idx]; s.set({ tracksFuro: s.tracksFuro.filter((x) => x.id !== t.id), ...(t.tipo === "analito" ? { analitos: s.analitos.filter((a) => a !== (t as TrackAnalito).analito) } : {}) }); }} />
      )}
      {importar && <ImportarSondagem mina={mina} fechar={() => setImportar(false)} />}
    </Stack>
  );
}

/** Planta e seção vertical das trajetórias (estimadas tracejadas), com as amostras coloridas pelo primeiro analito. */
function Trajetorias({ dados, analito, classes, selecionado, aoSelecionar }: { dados: Perfil[]; analito?: TrackAnalito; classes: Record<string, ClassesTrack>; selecionado: string | null; aoSelecionar: (id: string) => void }) {
  const com = dados.filter((d) => d.trajetoria);
  if (!com.length) return <Alert color="orange" w={260}>{dados[0].erro_trajetoria ?? "Sem trajetória."}</Alert>;
  const todos = com.flatMap((d) => d.trajetoria!.pontos);
  const W = 260;
  const vista = (ix: number, iy: number, titulo: string, inverterY: boolean) => {
    const xs = todos.map((p) => p[ix]), ys = todos.map((p) => p[iy]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0, 10) * 1.15, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = (W - 20) / span;
    const px = (v: number) => W / 2 + (v - cx) * k, py = (v: number) => (inverterY ? W / 2 - (v - cy) * k : W / 2 + (v - cy) * k);
    const escala = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((m) => m * k > 40) ?? 500;
    return (
      <div>
        <Text size="10px" fw={700} c="dimmed" tt="uppercase">{titulo}</Text>
        <svg width={W} height={W} style={{ border: "1px solid var(--mantine-color-gray-3)", background: "#fbfbfa", display: "block" }} data-testid={`traj-${titulo.split(" ")[0].toLowerCase()}`}>
          {com.map((d) => (
            <g key={d.furo.id}>
              <polyline points={d.trajetoria!.pontos.map((p) => `${px(p[ix])},${py(p[iy])}`).join(" ")} fill="none" stroke="#495057" strokeWidth={1.5} strokeDasharray={d.trajetoria!.estimada ? "5 3" : undefined} />
              <circle cx={px(d.trajetoria!.pontos[0][ix])} cy={py(d.trajetoria!.pontos[0][iy])} r={3.5} fill="#495057" />
              <text x={px(d.trajetoria!.pontos[0][ix]) + 5} y={py(d.trajetoria!.pontos[0][iy]) - 4} fontSize={10} fontWeight={700}>{d.furo.codigo}</text>
              {d.amostras.filter((a) => a.xyz).map((a) => {
                const v = analito ? a.valores[analito.analito] : undefined, c = analito ? classes[analito.id] : undefined;
                const cor = v?.y != null && c ? c.cores[classe(v.y, c.lim)] : "#fff";
                return <circle key={a.id} cx={px(a.xyz![ix])} cy={py(a.xyz![iy])} r={a.id === selecionado ? 6 : 3.5} fill={cor} stroke={a.id === selecionado ? "#1971c2" : "#333"} strokeWidth={a.id === selecionado ? 2 : 0.6} style={{ cursor: "pointer" }} onClick={() => aoSelecionar(a.id)}><title>{a.codigo}</title></circle>;
              })}
            </g>
          ))}
          <line x1={8} y1={W - 8} x2={8 + escala * k} y2={W - 8} stroke="#222" strokeWidth={2} /><text x={8} y={W - 12} fontSize={9}>{escala} m</text>
          {ix === 0 && iy === 1 && <text x={W - 22} y={13} fontSize={10}>N ↑</text>}
        </svg>
      </div>
    );
  };
  return (
    <Stack gap={6} style={{ flexShrink: 0 }}>
      {vista(0, 1, "Planta (X–Y)", true)}
      {vista(0, 2, "Seção leste–oeste (X–Z)", true)}
      <Text size="10px" c="dimmed" w={W}>Tracejado = trajetória estimada (sem survey suficiente). {com.some((d) => d.trajetoria!.aviso_crs) ? "Atenção: " + com.find((d) => d.trajetoria!.aviso_crs)!.trajetoria!.aviso_crs + " — mostrado no sistema original." : ""}</Text>
    </Stack>
  );
}

function exportarCsv(dados: Perfil[], analitos: string[]) {
  const linhas = [["furo", "amostra", "de_m", "ate_m", "comprimento_m", "litologia", ...analitos].join(";")];
  for (const d of dados) for (const a of d.amostras) {
    const lit = d.intervalos.find((i) => i.de <= a.de && i.ate >= a.ate)?.litologia?.nome ?? "";
    linhas.push([d.furo.codigo, a.codigo, a.de, a.ate, (a.ate - a.de).toFixed(2), lit, ...analitos.map((x) => a.valores[x]?.texto ?? "")].join(";").replace(/\./g, (m, i, t) => (/\d\.\d/.test(t.slice(i - 1, i + 2)) ? "," : m)));
  }
  const b = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(b), l = document.createElement("a");
  l.href = u; l.download = "sondagens_intervalos.csv"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}

interface Previa { id: string; furos: { furo: string; novo: boolean; surveys: number; intervalos: number; amostras: number }[]; erros: { arquivo: string; linha: number | null; mensagem: string }[]; avisos: { arquivo: string; linha: number | null; mensagem: string }[]; contagem: Record<string, number>; convencao_descricao: string }

function ImportarSondagem({ mina, fechar }: { mina: Mina; fechar: () => void }) {
  const qc = useQueryClient();
  const [arqs, setArqs] = useState<Record<string, File | null>>({ collar: null, survey: null, geologia: null, amostras: null });
  const [srid, setSrid] = useState<string>(String(mina.srid_trabalho));
  const [conv, setConv] = useState("horizontal_negativo");
  const [ref, setRef] = useState("quadricula");
  const [decl, setDecl] = useState<number | string>(0);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const analisar = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("srid", srid); fd.append("convencao", conv); fd.append("referencia_azimute", ref); fd.append("declinacao", String(decl || 0));
      for (const [k, f] of Object.entries(arqs)) if (f) fd.append(k, f);
      return api<Previa>(`/minas/${mina.id}/sondagem/importacoes`, { method: "POST", body: fd });
    },
    onSuccess: setPrevia,
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  const confirmar = useMutation({
    mutationFn: (ignorar: boolean) => api<Record<string, number>>(`/importacoes/${previa!.id}/confirmar-sondagem`, { method: "POST", body: json({ ignorar_erros: ignorar }) }),
    onSuccess: (g) => { qc.invalidateQueries(); notifications.show({ color: "teal", message: `Gravados: ${g.furos} furo(s), ${g.surveys} survey(s), ${g.intervalos} intervalo(s), ${g.amostras_ligadas} amostra(s) (${g.amostras_novas} nova(s)), ${g.resultados_ligados} resultado(s) ligados.` }); fechar(); },
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  return (
    <Modal opened onClose={fechar} size="xl" title="Importar sondagem">
      <Stack gap="xs">
        <Text size="sm">Envie um ou mais arquivos (CSV ou Excel). Cabeçalhos em português ou inglês: furo/hole_id, x/east, y/north, z/elev, azimute/azimuth, inclinação/dip, profundidade/depth, de/from, até/to, litologia, alteração, mineralização, amostra/sample.</Text>
        <SimpleGrid cols={2}>
          {(["collar", "survey", "geologia", "amostras"] as const).map((t) => (
            <FileInput key={t} size="xs" clearable label={{ collar: "Collar (boca do furo)", survey: "Survey (desvio)", geologia: "Geologia (intervalos)", amostras: "Amostras (intervalos)" }[t]}
              accept=".csv,.txt,.xlsx" value={arqs[t]} onChange={(f) => { setArqs({ ...arqs, [t]: f }); setPrevia(null); }} placeholder="escolher arquivo" />
          ))}
        </SimpleGrid>
        <Group grow align="flex-end">
          <Select size="xs" label="Sistema das coordenadas do collar" allowDeselect={false} value={srid} onChange={(v) => setSrid(v ?? "31983")}
            data={[{ value: "31983", label: "SIRGAS 2000 / UTM 23S (31983)" }, { value: "29193", label: "SAD69 / UTM 23S (29193)" }]} />
          <Select size="xs" label="Inclinação no arquivo" allowDeselect={false} value={conv} onChange={(v) => setConv(v ?? "horizontal_negativo")}
            data={[{ value: "horizontal_negativo", label: "Da horizontal, negativo = para baixo (−60)" }, { value: "horizontal_positivo", label: "Da horizontal, positivo = para baixo (60)" }, { value: "vertical", label: "Da vertical (0 = para baixo)" }]} />
        </Group>
        <Group grow align="flex-end">
          <Select size="xs" label="Azimute medido em relação ao" allowDeselect={false} value={ref} onChange={(v) => setRef(v ?? "quadricula")}
            data={[{ value: "quadricula", label: "Norte da quadrícula (UTM)" }, { value: "geografico", label: "Norte geográfico" }, { value: "magnetico", label: "Norte magnético" }]} />
          <NumberInput size="xs" label="Correção a somar ao azimute (graus)" description="declinação/convergência; 0 se já estiver na quadrícula" value={decl} onChange={setDecl} decimalScale={2} />
        </Group>
        <Button w="fit-content" disabled={!Object.values(arqs).some(Boolean)} loading={analisar.isPending} onClick={() => analisar.mutate()}>Ler e validar</Button>
        {previa && (
          <Stack gap={6}>
            <Text size="xs" c="dimmed">Inclinação: {previa.convencao_descricao}</Text>
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
