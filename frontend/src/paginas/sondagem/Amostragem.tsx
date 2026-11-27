import { Badge, Button, Divider, Drawer, Group, Loader, NavLink, Paper, ScrollArea, SegmentedControl, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/cliente";
import { m, teor } from "../../componentes/perfil";
import { baixarTexto, fmt, gravarLocal, lerLocal, padraoElementos, useSondagem } from "./tipos";

interface LinhaAmostra {
  id: string; codigo: string; furo_id: string | null; furo: string | null; tipo_furo: string | null; localizacao: string | null;
  de: number | null; ate: number | null; litologia: string | null; descricao: string | null; certificados: string[]; valores: Record<string, string>;
}
interface AnalitoCol { codigo: string; unidade: string; grupo: "ppm" | "%" | "ppb" | "outras" }
type Situacao = "todas" | "com" | "sem";
type Preset = "padrao" | "maiores" | "tracos" | "todos";
const SEM_LOCAL = "(sem localização)";

/** Amostragem geoquímica dos furos: todas as amostras de testemunho, filtros por situação e localização, teores lado a lado. */
export function AmostragemFuros() {
  const { mina, filtro, setFuro } = useSondagem();
  const navegar = useNavigate();
  const q = useQuery({ queryKey: ["sondagem-amostras", mina.id], queryFn: () => api<{ amostras: LinhaAmostra[]; analitos: AnalitoCol[] }>(`/minas/${mina.id}/sondagem/amostras`) });
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [local, setLocal] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [desc, setDesc] = useState("");
  const [preset, setPresetE] = useState<Preset>(() => lerLocal("geomina.sondagem.preset", "padrao"));
  const [limite, setLimite] = useState(200);
  const [aberta, setAberta] = useState<LinhaAmostra | null>(null);
  const setPreset = (p: Preset) => { setPresetE(p); gravarLocal("geomina.sondagem.preset", p); };

  const todas = useMemo(() => (q.data?.amostras ?? []).filter((a) => filtro === "todos" || !a.tipo_furo || a.tipo_furo === filtro), [q.data, filtro]);
  const comQ = (a: LinhaAmostra) => Object.keys(a.valores).length > 0;
  const porSituacao = todas.filter((a) => situacao === "todas" || (situacao === "com") === comQ(a));
  const locais = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of porSituacao) c[a.localizacao ?? SEM_LOCAL] = (c[a.localizacao ?? SEM_LOCAL] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [porSituacao]);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const linhas = porSituacao.filter((a) => (!local || (a.localizacao ?? SEM_LOCAL) === local)
    && (!codigo.trim() || norm(`${a.codigo} ${a.furo ?? ""}`).includes(norm(codigo.trim())))
    && (!desc.trim() || norm(`${a.litologia ?? ""} ${a.descricao ?? ""}`).includes(norm(desc.trim()))));
  const analitos = q.data?.analitos ?? [];
  const codigos = analitos.map((a) => a.codigo);
  const colunas = preset === "todos" ? analitos
    : preset === "maiores" ? analitos.filter((a) => a.grupo === "%")
      : preset === "tracos" ? analitos.filter((a) => a.grupo === "ppm" || a.grupo === "ppb")
        : analitos.filter((a) => padraoElementos(codigos).includes(a.codigo));

  if (q.isLoading) return <Loader size="sm" />;
  const exportar = () => baixarTexto([
    ["Código", "Furo", "Localização", "De", "Até", "Litologia", "Bateria (certificado)", ...colunas.map((c) => `${c.codigo} (${c.unidade})`)].join(";"),
    ...linhas.map((a) => [a.codigo, a.furo ?? "", a.localizacao ?? "", fmt(a.de, 3), fmt(a.ate, 3), a.litologia ?? "", a.certificados.join(" "), ...colunas.map((c) => teor(a.valores[c.codigo]))].join(";")),
  ].join("\n"), "amostragem_geoquimica_furos.csv");

  return (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      <Paper withBorder p="xs" w={230} style={{ flexShrink: 0 }}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Situação</Text>
        {([["todas", "Total de amostras", todas.length], ["com", "Com química", todas.filter(comQ).length], ["sem", "Sem química", todas.filter((a) => !comQ(a)).length]] as const).map(([k, r, n]) => (
          <NavLink key={k} active={situacao === k} label={r} rightSection={<Badge size="sm" variant="light">{n}</Badge>} onClick={() => { setSituacao(k); setLocal(null); }} py={4} />
        ))}
        <Divider my="xs" />
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>Localização</Text>
        <ScrollArea.Autosize mah="55vh">
          <NavLink active={!local} label="Todas" rightSection={<Badge size="sm" variant="light">{porSituacao.length}</Badge>} onClick={() => setLocal(null)} py={3} />
          {locais.map(([l, n]) => <NavLink key={l} active={local === l} label={<Text size="xs">{l}</Text>} rightSection={<Badge size="sm" variant="light" color="gray">{n}</Badge>} onClick={() => setLocal(l)} py={3} />)}
        </ScrollArea.Autosize>
      </Paper>
      <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <TextInput size="xs" w={170} placeholder="Buscar código ou furo" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
            <TextInput size="xs" w={210} placeholder="Buscar na descrição / litologia" value={desc} onChange={(e) => setDesc(e.currentTarget.value)} />
            <SegmentedControl size="xs" value={preset} onChange={(v) => setPreset(v as Preset)}
              data={[{ value: "padrao", label: "Padrão" }, { value: "maiores", label: "Maiores (%)" }, { value: "tracos", label: "Traços (ppm)" }, { value: "todos", label: "Todos" }]} />
            <Badge variant="light">{colunas.length} elementos</Badge>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">{linhas.length} amostra(s)</Text>
            <Button size="xs" variant="default" onClick={exportar} disabled={!linhas.length}>Exportar Excel (CSV)</Button>
          </Group>
        </Group>
        {!todas.length ? <Text size="sm" c="dimmed">Nenhuma amostra de testemunho. Importe a planilha de amostras dos furos e o laudo do laboratório.</Text> : (
          <ScrollArea type="auto" h="72vh">
            <Table striped highlightOnHover stickyHeader withTableBorder fz="xs" verticalSpacing={3} miw={700 + colunas.length * 70}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Código</Table.Th><Table.Th>Localização</Table.Th><Table.Th>Intervalo</Table.Th><Table.Th>Litologia</Table.Th><Table.Th>Bateria</Table.Th>
                  {colunas.map((c) => <Table.Th key={c.codigo} ta="right">{c.codigo}<Text span size="10px" c="dimmed"> {c.unidade}</Text></Table.Th>)}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {linhas.slice(0, limite).map((a) => (
                  <Table.Tr key={a.id} style={{ cursor: "pointer" }} onClick={() => setAberta(a)} bg={aberta?.id === a.id ? "blue.0" : undefined}>
                    <Table.Td fw={600}>{a.codigo}</Table.Td>
                    <Table.Td>{a.furo ? <b>{a.furo} </b> : null}<Text span size="xs" c="dimmed">{a.localizacao ?? ""}</Text></Table.Td>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>{a.de != null ? `${m(a.de)}–${m(a.ate)} m` : "—"}</Table.Td>
                    <Table.Td>{a.litologia ?? "—"}</Table.Td>
                    <Table.Td>{a.certificados.join(", ") || <Text span size="xs" c="dimmed">sem química</Text>}</Table.Td>
                    {colunas.map((c) => <Table.Td key={c.codigo} ta="right">{teor(a.valores[c.codigo])}</Table.Td>)}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {linhas.length > limite && <Button size="xs" variant="subtle" m="xs" onClick={() => setLimite((l) => l + 300)}>Mostrar mais ({linhas.length - limite} restantes)</Button>}
          </ScrollArea>
        )}
      </Stack>
      <Drawer opened={!!aberta} onClose={() => setAberta(null)} position="right" size={420} withOverlay={false} title={<Text fw={700}>{aberta?.codigo}</Text>} zIndex={300}>
        {aberta && (
          <Stack gap="xs">
            <Table withTableBorder fz="xs" verticalSpacing={3}>
              <Table.Tbody>
                <Table.Tr><Table.Th w={110}>Origem</Table.Th><Table.Td>Testemunho de sondagem</Table.Td></Table.Tr>
                <Table.Tr><Table.Th>Localização</Table.Th><Table.Td>{aberta.localizacao ?? "—"}</Table.Td></Table.Tr>
                <Table.Tr><Table.Th>Furo / ponto</Table.Th><Table.Td>{aberta.furo ?? "—"}{aberta.tipo_furo === "ina" ? " (INA)" : ""}</Table.Td></Table.Tr>
                <Table.Tr><Table.Th>Intervalo</Table.Th><Table.Td>{aberta.de != null ? `${m(aberta.de)} – ${m(aberta.ate)} m (${m((aberta.ate ?? 0) - aberta.de)} m)` : "—"}</Table.Td></Table.Tr>
                <Table.Tr><Table.Th>Litologia</Table.Th><Table.Td>{aberta.litologia ?? "—"}</Table.Td></Table.Tr>
                <Table.Tr><Table.Th>Bateria</Table.Th><Table.Td>{aberta.certificados.join(", ") || "—"}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
            {aberta.descricao && <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{aberta.descricao}</Text>}
            {aberta.furo_id && (
              <Group gap={6}>
                <Button size="compact-xs" onClick={() => { setFuro(aberta.furo_id); navegar("/sondagem"); }}>Perfil</Button>
                <Button size="compact-xs" variant="default" onClick={() => { setFuro(aberta.furo_id); navegar("/sondagem/tracks"); }}>Tracks do furo</Button>
                <Button size="compact-xs" variant="default" onClick={() => { setFuro(aberta.furo_id); navegar("/sondagem/fotos"); }}>Fotos</Button>
              </Group>
            )}
            <Divider label={`Química completa (${Object.keys(aberta.valores).length})`} labelPosition="left" />
            {(["%", "ppm", "ppb", "outras"] as const).map((g) => {
              const l = analitos.filter((a) => a.grupo === g && aberta.valores[a.codigo] != null);
              if (!l.length) return null;
              return (
                <div key={g}>
                  <Text size="10px" fw={700} c="dimmed">{g === "outras" ? "OUTRAS" : g.toUpperCase()}</Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 10px" }}>
                    {l.map((a) => <Text key={a.codigo} size="xs"><b>{a.codigo}</b> {teor(aberta.valores[a.codigo])}</Text>)}
                  </div>
                </div>
              );
            })}
            {!Object.keys(aberta.valores).length && <Text size="xs" c="dimmed">Sem resultado de laboratório ainda.</Text>}
          </Stack>
        )}
      </Drawer>
    </Group>
  );
}
