import { ActionIcon, Alert, Badge, Button, Group, Loader, Modal, NumberInput, ScrollArea, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { api, dataCurta, ErroApi, json } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { corLitologia, grupos, imprimirElemento, m, teor, type TermoP } from "../../componentes/perfil";

interface Trecho { de: number; ate: number; espessura: number; litologia: TermoP | null; litologia_texto: string | null; descricao: string | null; amostra: string | null; amostra_id: string | null }
interface AmostraP { id: string; codigo: string; de: number | null; ate: number | null; litologia: TermoP | null; estado: string; valores: Record<string, { texto: string; valor: number | null }>; certificados: string[] }
export interface PerfilFrenteDados {
  amostra: { id: string; codigo: string };
  frente: { ponto: string | null; local: string | null; data: string | null; ficha: string | null; origem: "perfil" | "ficha" | "amostras" | "sem_trechos" | null };
  intervalos: Trecho[];
  amostras: AmostraP[];
  analitos: { chave: string; codigo: string; unidade: string }[];
  comprimento: number;
}

const ORIGEM: Record<string, string> = {
  perfil: "Trechos da planilha de campo / editados no GeoMina",
  ficha: "Trechos da ficha de mapeamento",
  amostras: "Trechos tirados da seção de cada amostra (ainda sem perfil detalhado)",
  sem_trechos: "Esta frente ainda não tem trechos. Use \"Editar perfil\" para lançar metro a metro.",
};

export function PerfilFrente({ amostraId, podeEditar, aoFechar, aoEditarAmostra }: { amostraId: string; podeEditar: boolean; aoFechar: () => void; aoEditarAmostra: () => void }) {
  const q = useQuery({ queryKey: ["perfil-frente", amostraId], queryFn: () => api<PerfilFrenteDados>(`/amostras/${amostraId}/perfil-frente`) });
  const [editando, setEditando] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const d = q.data;
  return (
    <Modal opened onClose={aoFechar} size="95%" title={<Text fw={700}>Perfil da frente {d ? `— ${d.amostra.codigo}` : ""}</Text>}>
      {q.isLoading ? <Loader /> : q.error ? <Alert color="red">{q.error instanceof ErroApi ? q.error.message : "Falha ao carregar."}</Alert> : d && (
        editando ? <EditarPerfil d={d} aoFechar={() => setEditando(false)} /> : (
          <Stack gap="sm">
            <Group justify="space-between" className="nao-imprimir">
              <Text size="xs" c="dimmed">{d.frente.origem ? ORIGEM[d.frente.origem] : ""}</Text>
              <Group gap={6}>
                {podeEditar && <Button size="xs" variant="light" onClick={() => setEditando(true)}>Editar perfil</Button>}
                {podeEditar && <Button size="xs" variant="default" onClick={aoEditarAmostra}>Dados da amostra</Button>}
                <Button size="xs" variant="default" onClick={() => imprimirElemento(area.current, `Perfil da frente ${d.amostra.codigo}`)}>Imprimir / PDF</Button>
              </Group>
            </Group>
            <div ref={area}>
              <h1 style={{ fontSize: 16, margin: 0 }}>Perfil da frente — {d.amostra.codigo}</h1>
              <Text size="sm">
                {[d.frente.ponto && `Ponto ${d.frente.ponto}`, d.frente.local, d.frente.data && dataCurta(d.frente.data), d.frente.ficha && `Ficha ${d.frente.ficha}`].filter(Boolean).join(" · ")}
              </Text>
              {d.intervalos.length > 0 ? (
                <Group align="flex-start" wrap="nowrap" gap="md" mt="xs">
                  <ColunaFrente d={d} />
                  <TabelaTeores d={d} />
                </Group>
              ) : <Alert color="gray" mt="sm">Sem trechos para desenhar.</Alert>}
            </div>
          </Stack>
        )
      )}
    </Modal>
  );
}

function ColunaFrente({ d }: { d: PerfilFrenteDados }) {
  const total = Math.max(d.comprimento, 0.5);
  const px = Math.min(80, Math.max(24, 460 / total));
  const topo = 14, alt = total * px + topo + 10, W = 330;
  const y = (v: number) => topo + v * px;
  const marcas = [];
  const passo = total > 20 ? 5 : total > 8 ? 2 : total > 3 ? 1 : 0.5;
  for (let v = 0; v <= total + 1e-9; v += passo) marcas.push(v);
  // colchetes das amostras (de/até de cada amostra pelos trechos que ela cobre)
  const faixas = new Map<string, [number, number]>();
  for (const t of d.intervalos) if (t.amostra) { const f = faixas.get(t.amostra); faixas.set(t.amostra, f ? [Math.min(f[0], t.de), Math.max(f[1], t.ate)] : [t.de, t.ate]); }
  return (
    <svg width={W} height={alt} style={{ flexShrink: 0, fontFamily: "Arial, sans-serif" }} data-testid="coluna-frente">
      <text x={44} y={10} fontSize={10} fill="#555">Litologia</text>
      <text x={238} y={10} fontSize={10} fill="#555">Amostra</text>
      {marcas.map((v) => (
        <g key={v}><line x1={34} x2={40} y1={y(v)} y2={y(v)} stroke="#555" /><text x={30} y={y(v) + 3} fontSize={9} textAnchor="end">{m(v)} m</text></g>
      ))}
      <line x1={40} x2={40} y1={y(0)} y2={y(total)} stroke="#555" />
      {d.intervalos.map((t, k) => {
        const h = (t.ate - t.de) * px;
        const nome = t.litologia?.nome ?? t.litologia_texto ?? "—";
        return (
          <g key={k}>
            <rect x={40} y={y(t.de)} width={90} height={h} fill={corLitologia(t.litologia, t.litologia_texto)} stroke="#333" strokeWidth={0.6}>
              <title>{`${m(t.de)}–${m(t.ate)} m: ${nome}`}</title>
            </rect>
            {h >= 11 && <text x={85} y={y(t.de) + h / 2 + 3} fontSize={9} textAnchor="middle">{t.litologia?.sigla ?? ""}</text>}
            {h >= 11 && <text x={136} y={y(t.de) + h / 2 + 3} fontSize={10}>{nome.length > 18 ? nome.slice(0, 17) + "…" : nome}</text>}
          </g>
        );
      })}
      {[...faixas.entries()].map(([cod, [de, ate]]) => (
        <g key={cod}>
          <path d={`M232 ${y(de) + 1} h-6 V${y(ate) - 1} h6`} fill="none" stroke="#1c7ed6" strokeWidth={1.5} />
          <text x={236} y={(y(de) + y(ate)) / 2 + 3} fontSize={10} fill="#1c7ed6" fontWeight={600}>{cod}</text>
        </g>
      ))}
    </svg>
  );
}

function TabelaTeores({ d }: { d: PerfilFrenteDados }) {
  const am = new Map(d.amostras.map((a) => [a.id, a]));
  const span = grupos(d.intervalos, (t) => t.amostra_id);
  return (
    <ScrollArea style={{ flex: 1, minWidth: 0 }}>
      <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={2} miw={480 + d.analitos.length * 64} data-testid="tabela-perfil">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Trecho (m)</Table.Th><Table.Th>Esp. (m)</Table.Th><Table.Th>Litologia</Table.Th><Table.Th>Descrição</Table.Th><Table.Th>Amostra</Table.Th>
            {d.analitos.map((a) => <Table.Th key={a.chave} ta="right" style={{ whiteSpace: "nowrap" }}>{a.codigo}<br /><Text span size="10px" c="dimmed">{a.unidade}</Text></Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {d.intervalos.map((t, k) => {
            const a = t.amostra_id ? am.get(t.amostra_id) : undefined;
            return (
              <Table.Tr key={k}>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{m(t.de)} – {m(t.ate)}</Table.Td>
                <Table.Td ta="right">{m(t.espessura)}</Table.Td>
                <Table.Td><span style={{ display: "inline-block", width: 10, height: 10, background: corLitologia(t.litologia, t.litologia_texto), border: "1px solid #555", marginRight: 4 }} />{t.litologia?.nome ?? t.litologia_texto ?? "—"}</Table.Td>
                <Table.Td>{t.descricao ?? ""}</Table.Td>
                {span[k] > 0 && (
                  <>
                    <Table.Td rowSpan={span[k]} fw={600}>{t.amostra ?? <Text span size="xs" c="dimmed">não amostrado</Text>}{a && a.certificados.length > 0 && <Text size="10px" c="dimmed">{a.certificados.join(", ")}</Text>}{a && a.certificados.length === 0 && <Badge size="xs" color="gray" variant="light" display="block">sem laudo</Badge>}</Table.Td>
                    {d.analitos.map((an) => <Table.Td key={an.chave} rowSpan={span[k]} ta="right">{teor(a?.valores[an.chave]?.texto)}</Table.Td>)}
                  </>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {d.analitos.length === 0 && <Text size="xs" c="dimmed" mt={4}>Nenhum teor de laudo ligado às amostras desta frente ainda. Importe o laudo em "Laboratório (laudos)".</Text>}
    </ScrollArea>
  );
}

interface Linha { de: number | string; ate: number | string; litologia_id: string | null; descricao: string; amostra_codigo: string }

function EditarPerfil({ d, aoFechar }: { d: PerfilFrenteDados; aoFechar: () => void }) {
  const qc = useQueryClient();
  const dic = useDicionarios();
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    d.intervalos.length ? d.intervalos.map((t) => ({ de: t.de, ate: t.ate, litologia_id: t.litologia?.id ?? null, descricao: t.descricao ?? "", amostra_codigo: t.amostra ?? "" }))
      : [{ de: 0, ate: 1, litologia_id: null, descricao: "", amostra_codigo: d.amostra.codigo }]);
  const [erro, setErro] = useState<string | null>(null);
  const up = (k: number, p: Partial<Linha>) => setLinhas(linhas.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const mais = () => {
    const ult = linhas[linhas.length - 1];
    const de = ult ? Number(ult.ate) || 0 : 0;
    setLinhas([...linhas, { de, ate: de + 1, litologia_id: ult?.litologia_id ?? null, descricao: "", amostra_codigo: ult?.amostra_codigo ?? "" }]);
  };
  const salvar = useMutation({
    mutationFn: () => api(`/amostras/${d.amostra.id}/perfil-frente`, { method: "PUT", body: json({ intervalos: linhas.map((l) => ({ de_m: Number(l.de), ate_m: Number(l.ate), litologia_id: l.litologia_id, descricao: l.descricao || null, amostra_codigo: l.amostra_codigo || null })) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["perfil-frente"] }); qc.invalidateQueries({ queryKey: ["amostras"] }); notifications.show({ color: "teal", message: "Perfil da frente salvo." }); aoFechar(); },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });
  return (
    <Stack gap="xs">
      <Text size="sm">Lance a frente metro a metro: cada trecho com a rocha e a amostra que o cobre (deixe a amostra vazia nos trechos não amostrados). As amostras citadas passam a fazer parte desta frente.</Text>
      {erro && <Alert color="red">{erro}</Alert>}
      <ScrollArea>
        <Table fz="xs" miw={820} verticalSpacing={2}>
          <Table.Thead><Table.Tr><Table.Th w={90}>De (m)</Table.Th><Table.Th w={90}>Até (m)</Table.Th><Table.Th w={230}>Litologia</Table.Th><Table.Th>Descrição</Table.Th><Table.Th w={150}>Amostra</Table.Th><Table.Th w={30} /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {linhas.map((l, k) => (
              <Table.Tr key={k}>
                <Table.Td><NumberInput size="xs" min={0} decimalSeparator="," value={l.de} onChange={(v) => up(k, { de: v })} aria-label="De" /></Table.Td>
                <Table.Td><NumberInput size="xs" min={0} decimalSeparator="," value={l.ate} onChange={(v) => up(k, { ate: v })} aria-label="Até" /></Table.Td>
                <Table.Td><Select size="xs" searchable clearable data={dic.opcoes("LITOLOGIA", l.litologia_id)} value={l.litologia_id} onChange={(v) => up(k, { litologia_id: v })} aria-label="Litologia" /></Table.Td>
                <Table.Td><TextInput size="xs" value={l.descricao} onChange={(e) => up(k, { descricao: e.currentTarget.value })} aria-label="Descrição" /></Table.Td>
                <Table.Td><TextInput size="xs" placeholder="ex.: BS-RP-225" value={l.amostra_codigo} onChange={(e) => up(k, { amostra_codigo: e.currentTarget.value })} aria-label="Amostra" /></Table.Td>
                <Table.Td><ActionIcon size="sm" variant="subtle" color="red" onClick={() => setLinhas(linhas.filter((_, i) => i !== k))} aria-label="Remover trecho">✕</ActionIcon></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group justify="space-between">
        <Button size="xs" variant="light" onClick={mais}>+ Trecho</Button>
        <Group gap={6}>
          <Button size="xs" variant="default" onClick={aoFechar}>Cancelar</Button>
          <Button size="xs" loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar perfil</Button>
        </Group>
      </Group>
    </Stack>
  );
}
