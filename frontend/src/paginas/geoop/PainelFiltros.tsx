import { Accordion, Badge, Button, Checkbox, Group, Loader, ScrollArea, Select, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";

import { FACETAS, useGeo, type Faceta, type Pagina } from "./estado";

/** Filtros encadeados: as opções e contagens vêm do servidor, calculadas com os demais filtros já escolhidos. */
export function PainelFiltros({ dados, carregando }: { dados?: Pagina; carregando: boolean }) {
  const s = useGeo();
  const grupos = [...new Set(FACETAS.map((f) => f.grupo))];
  const ativos = Object.values(s.filtros).reduce((t, v) => t + (v?.length ?? 0), 0) + (s.texto ? 1 : 0) + (s.dataDe || s.dataAte ? 1 : 0) + (s.teor.analito && (s.teor.min || s.teor.max) ? 1 : 0);
  return (
    <aside data-testid="painel-filtros" style={{ borderRight: "1px solid var(--mantine-color-gray-3)", display: "flex", flexDirection: "column", minHeight: 0, background: "#fcfcfc" }}>
      <Group px="sm" py={6} justify="space-between" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Seleção {ativos > 0 && <Badge size="xs" ml={4}>{ativos}</Badge>}</Text>
        <Group gap={4}>{carregando && <Loader size={12} />}<Button size="compact-xs" variant="subtle" onClick={s.limpar} disabled={!ativos}>Limpar</Button></Group>
      </Group>
      <ScrollArea style={{ flex: 1 }} type="auto">
        <Stack gap={6} p="xs">
          <TextInput size="xs" placeholder="Código ou local (ex.: RP-428, 1F5)" value={s.texto} onChange={(e) => s.set({ texto: e.currentTarget.value })} aria-label="Buscar amostra" />
          <Accordion multiple defaultValue={["Local", "Laboratório"]} variant="default" chevronPosition="left"
            styles={{ control: { padding: "2px 4px" }, label: { padding: "4px 0", fontSize: 12, fontWeight: 700 }, content: { padding: "0 0 6px 4px" } }}>
            {grupos.map((g) => (
              <Accordion.Item key={g} value={g}>
                <Accordion.Control>{g}</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={8}>
                    {FACETAS.filter((f) => f.grupo === g).map((f) => <Faceta key={f.chave} f={f.chave} rotulo={f.rotulo} opcoes={dados?.opcoes[f.chave] ?? []} />)}
                    {g === "Amostragem" && (
                      <Group gap={4} grow>
                        <TextInput size="xs" type="date" label="Coleta de" value={s.dataDe} onChange={(e) => s.set({ dataDe: e.currentTarget.value })} />
                        <TextInput size="xs" type="date" label="até" value={s.dataAte} onChange={(e) => s.set({ dataAte: e.currentTarget.value })} />
                      </Group>
                    )}
                    {g === "Laboratório" && <FaixaTeor />}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>
      </ScrollArea>
    </aside>
  );
}

function Faceta({ f, rotulo, opcoes }: { f: Faceta; rotulo: string; opcoes: { valor: string; rotulo: string; n: number }[] }) {
  const { filtros, alternar, definir } = useGeo();
  const sel = filtros[f] ?? [];
  const [mais, setMais] = useState(false);
  if (!opcoes.length) return null;
  const visiveis = mais ? opcoes : opcoes.slice(0, 8);
  return (
    <div data-faceta={f}>
      <Group justify="space-between" gap={4}>
        <Text size="xs" c="dimmed" fw={600}>{rotulo}</Text>
        {sel.length > 0 && <Button size="compact-xs" variant="subtle" onClick={() => definir(f, [])}>todos</Button>}
      </Group>
      {visiveis.map((o) => (
        <Checkbox key={o.valor} size="xs" mt={3} checked={sel.includes(o.valor)} onChange={() => alternar(f, o.valor)} disabled={o.n === 0 && !sel.includes(o.valor)}
          label={<Group gap={4} wrap="nowrap"><Text size="xs" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }} c={o.valor === "_nenhum" ? "dimmed" : undefined}>{o.rotulo}</Text><Text size="xs" c="dimmed">{o.n}</Text></Group>} />
      ))}
      {opcoes.length > 8 && <Button size="compact-xs" variant="subtle" onClick={() => setMais(!mais)}>{mais ? "menos" : `mais ${opcoes.length - 8}`}</Button>}
    </div>
  );
}

function FaixaTeor() {
  const { teor, analitos, set } = useGeo();
  return (
    <div>
      <Text size="xs" c="dimmed" fw={600}>Faixa de teor</Text>
      <Select size="xs" mt={3} placeholder="Analito" clearable data={analitos} value={teor.analito} onChange={(v) => set({ teor: { ...teor, analito: v } })} aria-label="Analito da faixa de teor"
        nothingFoundMessage="Escolha os analitos no topo" />
      <Group gap={4} grow mt={3}>
        <TextInput size="xs" placeholder="mín" value={teor.min} onChange={(e) => set({ teor: { ...teor, min: e.currentTarget.value } })} aria-label="Teor mínimo" />
        <TextInput size="xs" placeholder="máx" value={teor.max} onChange={(e) => set({ teor: { ...teor, max: e.currentTarget.value } })} aria-label="Teor máximo" />
      </Group>
    </div>
  );
}
