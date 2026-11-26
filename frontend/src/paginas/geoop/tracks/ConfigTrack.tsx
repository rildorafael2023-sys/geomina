import { Button, Checkbox, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from "@mantine/core";

import { PALETAS, type Metodo } from "../../../geologia/classes";
import { NOME_GEO, type Altura, type Representacao, type Track, type TrackAnalito } from "./tipos";

/** Configuração de um track: representação, escala, limites, classes, cores, altura, ordem e remoção. */
export function ConfigTrack({ track, indice, total, mudar, mover, remover, fechar }: {
  track: Track; indice: number; total: number; mudar: (t: Track) => void; mover: (d: -1 | 1) => void; remover: () => void; fechar: () => void;
}) {
  const a = track.tipo === "analito" ? (track as TrackAnalito) : null;
  const set = (p: Partial<TrackAnalito>) => a && mudar({ ...a, ...p });
  return (
    <Modal opened onClose={fechar} size="md" title={`Track: ${a ? a.analito : NOME_GEO[track.tipo as keyof typeof NOME_GEO]}`}>
      <Stack gap="sm">
        {a && (
          <>
            <div>
              <Text size="xs" fw={600} mb={2}>Representação</Text>
              <SegmentedControl fullWidth value={a.representacao} onChange={(v) => set({ representacao: v as Representacao })}
                data={[{ value: "faixa", label: "Faixa colorida" }, { value: "barras", label: "Barras" }, { value: "pontos", label: "Pontos" }]} />
            </div>
            {a.representacao !== "faixa" && (
              <Group grow align="flex-end">
                <Select label="Escala" allowDeselect={false} value={a.escala} onChange={(v) => set({ escala: (v ?? "linear") as "linear" })} data={[{ value: "linear", label: "Linear" }, { value: "log", label: "Logarítmica" }]} />
                <TextInput label="Mínimo" placeholder="auto" value={a.min} onChange={(e) => set({ min: e.currentTarget.value })} />
                <TextInput label="Máximo" placeholder="auto" value={a.max} onChange={(e) => set({ max: e.currentTarget.value })} />
              </Group>
            )}
            {a.representacao === "pontos" && <Checkbox label="Ligar os pontos (só valores medidos; não indica continuidade geológica)" checked={a.ligar} onChange={(e) => set({ ligar: e.currentTarget.checked })} />}
            <Checkbox label="Mostrar os valores" checked={a.valores} onChange={(e) => set({ valores: e.currentTarget.checked })} />
            <div>
              <Text size="xs" fw={600} mb={2}>Classes de cor</Text>
              <SegmentedControl fullWidth value={a.metodo} onChange={(v) => set({ metodo: v as Metodo })}
                data={[{ value: "quantis", label: "Quantis" }, { value: "iguais", label: "Intervalos iguais" }, { value: "manual", label: "Meus limites" }]} />
            </div>
            <Group grow align="flex-end">
              {a.metodo === "manual"
                ? <TextInput label="Limites (separados por ;)" placeholder="ex.: 500; 1000; 1500" value={a.limites} onChange={(e) => set({ limites: e.currentTarget.value })} />
                : <Select label="Número de classes" allowDeselect={false} value={String(a.classes)} onChange={(v) => set({ classes: Number(v) })} data={["3", "4", "5", "6", "7"]} />}
              <Select label="Cores" allowDeselect={false} value={a.paleta} onChange={(v) => set({ paleta: v ?? "teor" })} data={Object.entries(PALETAS).map(([value, p]) => ({ value, label: p.nome }))} />
            </Group>
          </>
        )}
        <div>
          <Text size="xs" fw={600} mb={2}>Altura</Text>
          <SegmentedControl value={track.altura} onChange={(v) => mudar({ ...track, altura: v as Altura })} data={[{ value: "P", label: "Pequena" }, { value: "M", label: "Média" }, { value: "G", label: "Grande" }]} />
        </div>
        <Group justify="space-between">
          <Group gap="xs">
            <Button size="xs" variant="default" disabled={indice === 0} onClick={() => mover(-1)}>↑ Subir</Button>
            <Button size="xs" variant="default" disabled={indice === total - 1} onClick={() => mover(1)}>↓ Descer</Button>
          </Group>
          <Button size="xs" color="red" variant="light" onClick={() => { remover(); fechar(); }}>Remover track</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
