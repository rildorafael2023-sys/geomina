import { Alert, Badge, Button, Checkbox, ColorInput, Group, Loader, Modal, NumberInput, Paper, ScrollArea, Stack, Switch, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, ErroApi, json, type TipoUnidade } from "../../api/cliente";
import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { Pagina } from "../../componentes/ui";

type Form = Omit<TipoUnidade, "id" | "versao" | "filhos_permitidos">;
const NOVO: Form = { codigo: "", nome: "", pode_ser_raiz: false, possui_eixo: false, multinivel: false, e_nivel: false, e_frente: false, cor: "#868e96", ordem: 100, ativo: true };

export function ConfiguracaoEstrutura() {
  const qc = useQueryClient();
  const tipos = useQuery({ queryKey: ["tipos-unidade"], queryFn: () => api<TipoUnidade[]>("/tipos-unidade") });
  const [regras, setRegras] = useState<Record<string, string[]>>({});
  const [editando, setEditando] = useState<TipoUnidade | "novo" | null>(null);
  const [f, setF] = useState<Form>(NOVO);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (tipos.data) setRegras(Object.fromEntries(tipos.data.map((t) => [t.codigo, [...t.filhos_permitidos]])));
  }, [tipos.data]);

  const atualizar = (dados: TipoUnidade[]) => qc.setQueryData(["tipos-unidade"], dados);
  const salvarRegras = useMutation({
    mutationFn: () => api<TipoUnidade[]>("/regras-hierarquia", { method: "PUT", body: json({ regras }) }),
    onSuccess: (d) => {
      atualizar(d);
      notifications.show({ color: "teal", message: "Regras de hierarquia salvas." });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar as regras."),
  });
  const salvarTipo = useMutation({
    mutationFn: () =>
      editando === "novo"
        ? api<TipoUnidade[]>("/tipos-unidade", { method: "POST", body: json(f) })
        : api<TipoUnidade[]>(`/tipos-unidade/${(editando as TipoUnidade).id}`, {
            method: "PATCH",
            body: json({ ...f, codigo: undefined, versao: (editando as TipoUnidade).versao }),
          }),
    onSuccess: (d) => {
      atualizar(d);
      setEditando(null);
      notifications.show({ color: "teal", message: "Tipo de unidade salvo." });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar o tipo."),
  });

  if (tipos.isLoading) return <Loader />;
  const lista = tipos.data ?? [];
  const alternar = (pai: string, filho: string) =>
    setRegras((r) => ({ ...r, [pai]: r[pai]?.includes(filho) ? r[pai].filter((x) => x !== filho) : [...(r[pai] ?? []), filho] }));

  return (
    <Pagina titulo="Configuração da estrutura" icone={<IconAdjustmentsHorizontal size={20} />}>
      {erro && (
        <Alert color="red" withCloseButton onClose={() => setErro(null)}>
          {erro}
        </Alert>
      )}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>Tipos de unidade</Text>
          <Button size="xs" onClick={() => { setErro(null); setF(NOVO); setEditando("novo"); }}>
            Novo tipo
          </Button>
        </Group>
        <ScrollArea>
          <Table striped miw={620}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Características</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((t) => (
                <Table.Tr key={t.id} style={{ opacity: t.ativo ? 1 : 0.5 }}>
                  <Table.Td>
                    <Badge color={t.cor ?? "gray"}>{t.nome}</Badge>
                  </Table.Td>
                  <Table.Td>{t.codigo}</Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {[t.pode_ser_raiz && "pode ficar na raiz", t.e_nivel && "é nível", t.multinivel && "atravessa níveis", t.possui_eixo && "tem eixo", t.e_frente && "é frente", !t.ativo && "inativo"]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="subtle" onClick={() => { setErro(null); const { id: _i, versao: _v, filhos_permitidos: _f, ...resto } = t; setF(resto); setEditando(t); }}>
                      Editar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Paper withBorder p="md">
        <Text fw={600}>Regras de hierarquia</Text>
        <Text size="sm" c="dimmed" mb="sm">
          Linha = unidade-pai; coluna = o que pode ser criado dentro dela. O banco recusa unidades fora destas regras, e uma
          regra já usada por unidades existentes não pode ser removida.
        </Text>
        <ScrollArea>
          <Table withColumnBorders miw={720}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Dentro de ↓ pode ter →</Table.Th>
                {lista.map((t) => (
                  <Table.Th key={t.codigo} style={{ fontSize: 11, textAlign: "center" }}>
                    {t.nome}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.map((p) => (
                <Table.Tr key={p.codigo}>
                  <Table.Td fw={500}>{p.nome}</Table.Td>
                  {lista.map((c) => (
                    <Table.Td key={c.codigo} style={{ textAlign: "center" }}>
                      <Checkbox
                        aria-label={`${c.nome} dentro de ${p.nome}`}
                        checked={regras[p.codigo]?.includes(c.codigo) ?? false}
                        onChange={() => alternar(p.codigo, c.codigo)}
                        style={{ display: "inline-block" }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Group justify="flex-end" mt="sm">
          <Button loading={salvarRegras.isPending} onClick={() => { setErro(null); salvarRegras.mutate(); }}>
            Salvar regras
          </Button>
        </Group>
      </Paper>

      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={editando === "novo" ? "Novo tipo de unidade" : "Editar tipo de unidade"}>
        <Stack>
          {erro && <Alert color="red">{erro}</Alert>}
          <TextInput label="Código" description="Letras maiúsculas, números e _" disabled={editando !== "novo"} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value.toUpperCase() })} />
          <TextInput label="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} />
          <ColorInput label="Cor" value={f.cor ?? ""} onChange={(v) => setF({ ...f, cor: v || null })} />
          <NumberInput label="Ordem de exibição" value={f.ordem} onChange={(v) => setF({ ...f, ordem: Number(v) || 0 })} />
          <Switch label="Pode ficar na raiz da mina" checked={f.pode_ser_raiz} onChange={(e) => setF({ ...f, pode_ser_raiz: e.currentTarget.checked })} />
          <Switch label="É nível" checked={f.e_nivel} onChange={(e) => setF({ ...f, e_nivel: e.currentTarget.checked })} />
          <Switch label="Atravessa vários níveis (multinível)" checked={f.multinivel} onChange={(e) => setF({ ...f, multinivel: e.currentTarget.checked })} />
          <Switch label="Tem eixo (galeria, travessa, rampa)" checked={f.possui_eixo} onChange={(e) => setF({ ...f, possui_eixo: e.currentTarget.checked })} />
          <Switch label="É frente (registra avanços)" checked={f.e_frente} onChange={(e) => setF({ ...f, e_frente: e.currentTarget.checked })} />
          {editando !== "novo" && <Switch label="Ativo" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.currentTarget.checked })} />}
          <Button loading={salvarTipo.isPending} onClick={() => { setErro(null); salvarTipo.mutate(); }}>
            Salvar
          </Button>
        </Stack>
      </Modal>
    </Pagina>
  );
}
