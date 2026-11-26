import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Stack, Table, Text, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Mina } from "../../api/cliente";
import { Planta } from "./Planta";

interface EixoVersao { id: string; numero: number; vertices: number; comprimento_3d: number; comprimento_2d: number; origem: string; inicio_descricao: string | null; observacao: string | null; vigente: boolean; criado_em: string; coordenadas: number[][] }
interface Posicao { tipo: string; objeto: string; chainage_m: number; afastamento_m: number; ambigua: boolean }
interface Calculo { posicoes: { tipo: string; objeto: string; chainage_m: number; afastamento_m: number; alertas: string[]; convertido: boolean }[]; ignorados: { objeto: string; motivo: string }[] }

const msg = (e: unknown) => (e instanceof ErroApi ? e.message : String(e));
const TIPO: Record<string, string> = { amostra: "Amostra", mapeamento: "Ficha", avanco: "Avanço" };

/** Aba "Eixo e chainage" de uma galeria/travessa/rampa. */
export function EixoUnidade({ unidadeId, mina, pode }: { unidadeId: string; mina: Mina; pode: boolean }) {
  const qc = useQueryClient();
  const eixos = useQuery({ queryKey: ["eixos", unidadeId], queryFn: () => api<EixoVersao[]>(`/unidades/${unidadeId}/eixos`) });
  const pos = useQuery({ queryKey: ["posicoes", unidadeId], queryFn: () => api<Posicao[]>(`/unidades/${unidadeId}/posicoes`) });
  const [novo, setNovo] = useState(false);
  const [calc, setCalc] = useState<Calculo | null>(null);
  const calcular = useMutation({
    mutationFn: () => api<Calculo>(`/unidades/${unidadeId}/eixos/posicoes`, { method: "POST" }),
    onSuccess: (r) => { setCalc(r); qc.invalidateQueries({ queryKey: ["posicoes", unidadeId] }); },
    onError: (e) => notifications.show({ color: "red", message: msg(e) }),
  });
  if (!eixos.data) return <Loader size="sm" />;
  const vig = eixos.data.find((e) => e.vigente);
  const alertas = new Map((calc?.posicoes ?? []).map((p) => [p.objeto, p.alertas]));
  return (
    <Stack gap="sm">
      {vig ? (
        <Group gap="xs">
          <Badge size="lg" color="teal">Eixo v{vig.numero}</Badge>
          <Text size="sm">Comprimento <b>{vig.comprimento_3d.toFixed(2)} m</b> (3D; em planta {vig.comprimento_2d.toFixed(2)} m) · {vig.vertices} vértices · 0 m = {vig.inicio_descricao || "primeiro vértice"}</Text>
        </Group>
      ) : <Alert color="yellow">Esta unidade ainda não tem eixo. Sem eixo não há chainage (posição ao longo da galeria).</Alert>}
      <Group>
        {pode && <Button size="xs" onClick={() => setNovo(true)}>{vig ? "Nova versão do eixo" : "Definir eixo"}</Button>}
        {pode && vig && <Button size="xs" variant="light" loading={calcular.isPending} onClick={() => calcular.mutate()}>Calcular posições (amostras, fichas, avanços)</Button>}
      </Group>
      {calc?.ignorados.length ? (
        <Alert color="orange" title={`${calc.ignorados.length} item(ns) sem posição`}>
          {calc.ignorados.map((i) => <Text size="xs" key={i.objeto}>{i.objeto}: {i.motivo}</Text>)}
        </Alert>
      ) : null}
      {!!pos.data?.length && (
        <Table.ScrollContainer minWidth={560}><Table striped fz="sm">
          <Table.Thead><Table.Tr><Table.Th>Chainage (m)</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Item</Table.Th><Table.Th>Distância ao eixo (m)</Table.Th><Table.Th>Alertas</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {pos.data.map((p, i) => (
              <Table.Tr key={i}>
                <Table.Td fw={600}>{p.chainage_m.toFixed(2)}</Table.Td><Table.Td>{TIPO[p.tipo] ?? p.tipo}</Table.Td><Table.Td>{p.objeto}</Table.Td>
                <Table.Td c={p.afastamento_m > 10 ? "orange" : undefined}>{p.afastamento_m.toFixed(2)}</Table.Td>
                <Table.Td>{(alertas.get(p.objeto) ?? (p.ambigua ? ["posição ambígua"] : [])).map((a) => <Badge key={a} size="xs" color="orange" mr={4}>{a}</Badge>)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table></Table.ScrollContainer>
      )}
      {vig && <Text size="xs" c="dimmed">O chainage é medido ao longo do eixo em 3D (inclui a inclinação de rampas). Cada cálculo é ligado à versão do eixo; ao criar nova versão, recalcule.</Text>}
      {eixos.data.length > 1 && (
        <Text size="xs" c="dimmed">Versões anteriores: {eixos.data.filter((e) => !e.vigente).map((e) => `v${e.numero} (${e.comprimento_3d.toFixed(1)} m, ${new Date(e.criado_em).toLocaleDateString("pt-BR")})`).join(" · ")}</Text>
      )}
      {novo && <NovoEixo unidadeId={unidadeId} mina={mina} fechar={() => setNovo(false)} />}
    </Stack>
  );
}

function NovoEixo({ unidadeId, mina, fechar }: { unidadeId: string; mina: Mina; fechar: () => void }) {
  const qc = useQueryClient();
  const [feicao, setFeicao] = useState<{ id: string; camada: string } | null>(null);
  const [texto, setTexto] = useState("");
  const [inverter, setInverter] = useState(false);
  const [inicio, setInicio] = useState("");
  const pontos = texto.trim() ? texto.trim().split(/\n+/).map((l) => l.trim().split(/[;\t ]+/).map((v) => Number(v.replace(",", ".")))) : null;
  const pontosOk = !pontos || pontos.every((p) => p.length === 3 && p.every(Number.isFinite));
  const salvar = useMutation({
    mutationFn: () => api(`/unidades/${unidadeId}/eixos`, { method: "POST", body: json({ feicao_id: pontos ? null : feicao?.id, pontos, inverter, inicio_descricao: inicio || null }) }),
    onSuccess: () => { qc.invalidateQueries(); notifications.show({ color: "teal", message: "Eixo salvo. Calcule as posições novamente." }); fechar(); },
    onError: (e) => notifications.show({ color: "red", message: msg(e) }),
  });
  return (
    <Modal opened onClose={fechar} size="95%" title="Definir eixo da unidade">
      <Stack gap="sm">
        <Text size="sm"><b>Opção 1</b>: clique na linha do eixo na planta (de preferência uma polilinha 3D com cota). <b>Opção 2</b>: digite os pontos X Y Z, um por linha, em {mina.srid_trabalho}.</Text>
        <Planta minaId={mina.id} altura={420} aoEscolher={(id, camada) => setFeicao({ id, camada })} />
        <Textarea label="Pontos (X Y Z por linha) — deixe vazio para usar a linha selecionada" autosize minRows={2} maxRows={6} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} error={pontosOk ? undefined : "Cada linha precisa de 3 números: X Y Z"} />
        <Group align="flex-end">
          <TextInput label="Onde fica o 0 m" placeholder="ex.: emboque na rampa" value={inicio} onChange={(e) => setInicio(e.currentTarget.value)} />
          <Checkbox label="Inverter sentido (0 m na outra ponta)" checked={inverter} onChange={(e) => setInverter(e.currentTarget.checked)} />
          <Button loading={salvar.isPending} disabled={!pontosOk || (!pontos && !feicao)} onClick={() => salvar.mutate()}>
            {pontos ? `Salvar eixo com ${pontos.length} pontos` : feicao ? `Usar linha selecionada (${feicao.camada})` : "Selecione uma linha"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
