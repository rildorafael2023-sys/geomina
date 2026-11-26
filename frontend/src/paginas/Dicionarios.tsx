import { Alert, Badge, Button, ColorInput, Group, Loader, Modal, NumberInput, Paper, ScrollArea, Select, Stack, Switch, Table, Tabs, Text, TextInput, Textarea, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Dicionario, type Termo } from "../api/cliente";
import { useDicionarios } from "../api/dicionarios";

type Form = { codigo: string; nome: string; sigla: string; cor: string; classe: string | null; ordem: number; ativo: boolean; sinonimos: string; descricao: string };

export function Dicionarios({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient();
  const dic = useDicionarios();
  const [aba, setAba] = useState<string | null>("LITOLOGIA");
  const [edit, setEdit] = useState<{ dic: Dicionario; termo: Termo | null } | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async () => {
      const { dic: d, termo } = edit!;
      let lista: Dicionario[];
      if (termo) {
        lista = await api<Dicionario[]>(`/termos/${termo.id}`, {
          method: "PATCH",
          body: json({ versao: termo.versao, nome: f!.nome, sigla: f!.sigla || null, cor: f!.cor || null, ordem: f!.ordem, ativo: f!.ativo, descricao: f!.descricao || null }),
        });
      } else {
        lista = await api<Dicionario[]>(`/dicionarios/${d.codigo}/termos`, {
          method: "POST",
          body: json({ codigo: f!.codigo, nome: f!.nome, sigla: f!.sigla || null, cor: f!.cor || null, classe: f!.classe, ordem: f!.ordem, descricao: f!.descricao || null }),
        });
      }
      const novo = lista.find((x) => x.codigo === d.codigo)!.termos.find((x) => x.codigo.toUpperCase() === (termo?.codigo ?? f!.codigo).toUpperCase())!;
      const sins = f!.sinonimos.split(";").map((x) => x.trim()).filter(Boolean);
      if (sins.join(";") !== novo.sinonimos.join(";")) {
        await api(`/termos/${novo.id}/sinonimos`, { method: "PUT", body: json({ textos: sins }) });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dicionarios"] });
      setEdit(null);
      notifications.show({ color: "teal", message: "Dicionário atualizado." });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });

  if (dic.isLoading) return <Loader />;
  const abrir = (d: Dicionario, t: Termo | null) => {
    setErro(null);
    setEdit({ dic: d, termo: t });
    setF(t
      ? { codigo: t.codigo, nome: t.nome, sigla: t.sigla ?? "", cor: t.cor ?? "", classe: t.classe, ordem: t.ordem, ativo: t.ativo, sinonimos: t.sinonimos.join("; "), descricao: t.descricao ?? "" }
      : { codigo: "", nome: "", sigla: "", cor: "", classe: d.codigo === "TIPO_ESTRUTURA" ? "planar" : null, ordem: (d.termos.at(-1)?.ordem ?? 0) + 10, ativo: true, sinonimos: "", descricao: "" });
  };

  return (
    <Stack>
      <div>
        <Title order={3}>Dicionários</Title>
        <Text size="sm" c="dimmed">
          Listas usadas nas fichas: litologias, alterações, estruturas, minerais… Termos inativos deixam de ser oferecidos, mas continuam nos registros antigos.
          Sinônimos permitem reconhecer outras grafias em importações de planilhas.
        </Text>
      </div>
      <Tabs value={aba} onChange={setAba}>
        <ScrollArea>
          <Tabs.List style={{ flexWrap: "nowrap" }}>
            {(dic.data ?? []).map((d) => <Tabs.Tab key={d.codigo} value={d.codigo}>{d.nome}</Tabs.Tab>)}
          </Tabs.List>
        </ScrollArea>
        {(dic.data ?? []).map((d) => (
          <Tabs.Panel key={d.codigo} value={d.codigo} pt="sm">
            <Paper withBorder p="sm">
              {podeEditar && <Group justify="flex-end" mb="xs"><Button size="xs" onClick={() => abrir(d, null)}>Novo termo</Button></Group>}
              <ScrollArea>
                <Table striped miw={560}>
                  <Table.Thead>
                    <Table.Tr><Table.Th>Nome</Table.Th><Table.Th>Sigla</Table.Th><Table.Th>Código</Table.Th><Table.Th>Sinônimos</Table.Th><Table.Th /></Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {d.termos.map((t) => (
                      <Table.Tr key={t.id} style={{ opacity: t.ativo ? 1 : 0.5 }}>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            {t.cor && <span style={{ width: 12, height: 12, background: t.cor, border: "1px solid #888", display: "inline-block" }} />}
                            {t.nome} {!t.ativo && <Badge size="xs" color="gray">inativo</Badge>} {t.classe && <Badge size="xs" variant="outline">{t.classe}</Badge>}
                          </Group>
                        </Table.Td>
                        <Table.Td>{t.sigla}</Table.Td>
                        <Table.Td c="dimmed" fz="xs">{t.codigo}</Table.Td>
                        <Table.Td fz="xs">{t.sinonimos.join("; ")}</Table.Td>
                        <Table.Td>{podeEditar && <Button size="compact-xs" variant="subtle" onClick={() => abrir(d, t)}>editar</Button>}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          </Tabs.Panel>
        ))}
      </Tabs>
      <Modal opened={edit !== null} onClose={() => setEdit(null)} title={edit?.termo ? `Editar: ${edit.termo.nome}` : `Novo termo em ${edit?.dic.nome}`}>
        {f && (
          <Stack>
            {erro && <Alert color="red">{erro}</Alert>}
            <TextInput label="Código" description="Letras, números e _" disabled={!!edit?.termo} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value.toUpperCase() })} />
            <TextInput label="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} />
            <TextInput label="Sigla" placeholder="ex.: Gnp" value={f.sigla} onChange={(e) => setF({ ...f, sigla: e.currentTarget.value })} />
            {edit?.dic.codigo === "TIPO_ESTRUTURA" && (
              <Select label="Classe" disabled={!!edit?.termo} allowDeselect={false} value={f.classe} onChange={(v) => setF({ ...f, classe: v })}
                data={[{ value: "planar", label: "Plano (dir. mergulho/mergulho)" }, { value: "linear", label: "Linha (rumo/caimento)" }]} />
            )}
            <ColorInput label="Cor (coluna e mapas)" value={f.cor} onChange={(v) => setF({ ...f, cor: v })} />
            <NumberInput label="Ordem" value={f.ordem} onChange={(v) => setF({ ...f, ordem: Number(v) || 0 })} />
            <Textarea label="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.currentTarget.value })} />
            <TextInput label="Sinônimos (separados por ;)" placeholder="ex.: Lente cloritito; Lente de cloritito" value={f.sinonimos} onChange={(e) => setF({ ...f, sinonimos: e.currentTarget.value })} />
            {edit?.termo && <Switch label="Ativo" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.currentTarget.checked })} />}
            <Button loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Salvar</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
