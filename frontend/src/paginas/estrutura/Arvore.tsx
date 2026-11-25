import { Badge, Box, Group, Text, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";

import type { TipoUnidade, UnidadeResumo } from "../../api/cliente";

export interface No extends UnidadeResumo {
  filhos: No[];
}

export function montarArvore(lista: UnidadeResumo[], tipos: TipoUnidade[]): No[] {
  const ordem = new Map(tipos.map((t) => [t.codigo, t.ordem]));
  const nos = new Map<string, No>(lista.map((u) => [u.id, { ...u, filhos: [] }]));
  const raizes: No[] = [];
  for (const no of nos.values()) {
    const pai = no.pai_id ? nos.get(no.pai_id) : undefined;
    (pai ? pai.filhos : raizes).push(no);
  }
  const ordenar = (xs: No[]) => {
    xs.sort((a, b) => (ordem.get(a.tipo) ?? 0) - (ordem.get(b.tipo) ?? 0) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
    xs.forEach((x) => ordenar(x.filhos));
  };
  ordenar(raizes);
  return raizes;
}

/** Ids das unidades que casam com o filtro e de todos os seus ancestrais (para mantê-las visíveis). */
export function filtrar(lista: UnidadeResumo[], texto: string): Set<string> | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  const porId = new Map(lista.map((u) => [u.id, u]));
  const visiveis = new Set<string>();
  for (const u of lista) {
    if (u.codigo.toLowerCase().includes(t) || u.nome.toLowerCase().includes(t)) {
      let atual: UnidadeResumo | undefined = u;
      while (atual && !visiveis.has(atual.id)) {
        visiveis.add(atual.id);
        atual = atual.pai_id ? porId.get(atual.pai_id) : undefined;
      }
    }
  }
  return visiveis;
}

interface Props {
  nos: No[];
  cores: Map<string, string>;
  selecionado: string | null;
  aoSelecionar: (id: string) => void;
  visiveis: Set<string> | null;
  /** Ancestrais da unidade selecionada: são abertos automaticamente para ela ficar visível. */
  abrir: Set<string>;
}

export function Arvore(props: Props) {
  return (
    <Box role="tree" aria-label="Estrutura da mina">
      {props.nos.map((n) => (
        <Ramo key={n.id} no={n} nivel={0} {...props} />
      ))}
    </Box>
  );
}

function Ramo({ no, nivel, ...p }: Props & { no: No; nivel: number }) {
  const [aberto, setAberto] = useState(nivel < 1);
  const deveAbrir = p.abrir.has(no.id);
  useEffect(() => {
    if (deveAbrir) setAberto(true);
  }, [deveAbrir]);
  if (p.visiveis && !p.visiveis.has(no.id)) return null;
  const expandido = aberto || !!p.visiveis;
  const sel = p.selecionado === no.id;
  return (
    <div role="treeitem" aria-expanded={no.filhos.length ? expandido : undefined} aria-selected={sel}>
      <Group gap={4} wrap="nowrap" pl={nivel * 16}>
        <UnstyledButton
          w={20}
          aria-label={expandido ? "Recolher" : "Expandir"}
          onClick={() => setAberto(!aberto)}
          style={{ visibility: no.filhos.length ? "visible" : "hidden", textAlign: "center" }}
        >
          {expandido ? "▾" : "▸"}
        </UnstyledButton>
        <UnstyledButton
          onClick={() => p.aoSelecionar(no.id)}
          px={6}
          py={3}
          style={{
            borderRadius: 4,
            flex: 1,
            minWidth: 0,
            background: sel ? "var(--mantine-color-teal-light)" : undefined,
            opacity: no.ativo ? 1 : 0.5,
          }}
        >
          <Group gap={6} wrap="nowrap">
            <Badge size="xs" variant="filled" color={p.cores.get(no.tipo) ?? "gray"} style={{ flexShrink: 0 }}>
              {no.tipo_nome}
            </Badge>
            <Text size="sm" fw={sel ? 600 : 400} truncate>
              {no.codigo}
              {no.nome !== no.codigo ? ` — ${no.nome}` : ""}
            </Text>
            {no.status !== "ativa" && (
              <Text size="xs" c="dimmed">
                ({no.status})
              </Text>
            )}
            {!no.ativo && (
              <Text size="xs" c="dimmed">
                (inativa)
              </Text>
            )}
          </Group>
        </UnstyledButton>
      </Group>
      {expandido && no.filhos.map((f) => <Ramo key={f.id} no={f} nivel={nivel + 1} {...p} />)}
    </div>
  );
}

export function ancestrais(lista: UnidadeResumo[], id: string | null): Set<string> {
  const porId = new Map(lista.map((u) => [u.id, u]));
  const r = new Set<string>();
  let atual = id ? porId.get(id) : undefined;
  while (atual?.pai_id) {
    r.add(atual.pai_id);
    atual = porId.get(atual.pai_id);
  }
  return r;
}
