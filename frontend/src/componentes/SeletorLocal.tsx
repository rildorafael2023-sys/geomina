import { ActionIcon, Alert, Button, Group, Modal, Select, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Mina, type TipoUnidade, type UnidadeDetalhe, type UnidadeResumo } from "../api/cliente";

const rotulo = (u: UnidadeResumo) => `${u.codigo}${u.nome !== u.codigo ? " — " + u.nome : ""} (${u.tipo_nome})`;

/** Escolha do local (unidade da mina) com cadastro rápido: ex.: "Travessa 1F5", dentro do nível ou da rampa escolhida. */
export function SeletorLocal({ mina, valor, aoMudar, label = "Local (unidade da mina)", required, readOnly, extra, podeCriar = true }: {
  mina: Mina; valor: string | null; aoMudar: (id: string | null) => void; label?: string; required?: boolean; readOnly?: boolean;
  extra?: { value: string; label: string }[]; podeCriar?: boolean;
}) {
  const unidades = useQuery({ queryKey: ["unidades", mina.id, false], queryFn: () => api<UnidadeResumo[]>(`/minas/${mina.id}/unidades?incluir_inativas=false`) });
  const [novo, setNovo] = useState(false);
  const opcoes = (unidades.data ?? []).map((u) => ({ value: u.id, label: rotulo(u) }));
  for (const e of extra ?? []) if (!opcoes.some((o) => o.value === e.value)) opcoes.push(e);
  return (
    <>
      <Group gap={4} align="flex-end" wrap="nowrap">
        <Select style={{ flex: 1 }} label={label} required={required} searchable clearable={!required} data={opcoes} value={valor} onChange={aoMudar} readOnly={readOnly}
          nothingFoundMessage="Local não cadastrado: use o botão + ao lado" />
        {!readOnly && podeCriar && (
          <Tooltip label="Cadastrar novo local (galeria, travessa, rampa…)">
            <ActionIcon size={36} variant="light" onClick={() => setNovo(true)} aria-label="Novo local">+</ActionIcon>
          </Tooltip>
        )}
      </Group>
      {novo && <NovoLocal mina={mina} unidades={unidades.data ?? []} aoFechar={() => setNovo(false)} aoCriar={(id) => { aoMudar(id); setNovo(false); }} />}
    </>
  );
}

function NovoLocal({ mina, unidades, aoFechar, aoCriar }: { mina: Mina; unidades: UnidadeResumo[]; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const qc = useQueryClient();
  const tipos = useQuery({ queryKey: ["tipos-unidade"], queryFn: () => api<TipoUnidade[]>("/tipos-unidade") });
  const ativos = (tipos.data ?? []).filter((t) => t.ativo);
  const [f, setF] = useState({ tipo: "" as string, codigo: "", nome: "", pai: null as string | null });
  const [erro, setErro] = useState<string | null>(null);
  const tipo = f.tipo || ativos.find((t) => t.codigo === "TRAVESSA")?.codigo || ativos[0]?.codigo || "";
  const salvar = useMutation({
    mutationFn: () => api<UnidadeDetalhe>("/unidades", { method: "POST", body: json({ mina_id: mina.id, tipo, pai_id: f.pai, codigo: f.codigo.trim(), nome: f.nome.trim() || f.codigo.trim(), niveis: [] }) }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      notifications.show({ color: "teal", message: `Local ${u.codigo} cadastrado.` });
      aoCriar(u.id);
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao cadastrar."),
  });
  return (
    <Modal opened onClose={aoFechar} title="Novo local na mina" zIndex={400}>
      <Stack gap="sm">
        {erro && <Alert color="red">{erro}</Alert>}
        <Select label="Tipo" allowDeselect={false} data={ativos.map((t) => ({ value: t.codigo, label: t.nome }))} value={tipo} onChange={(v) => setF({ ...f, tipo: v ?? "" })} comboboxProps={{ zIndex: 500 }} />
        <TextInput label="Código" description="Único na mina. Ex.: 1F5, TR-1F5, N144, RAMPA-SUL" required value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value })} data-autofocus />
        <TextInput label="Nome" placeholder="ex.: Travessa 1F5" description="Se vazio, usa o código" value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} />
        <Select label="Fica em (região)" description="Nível, galeria ou rampa onde este local está. Pode deixar vazio." searchable clearable
          data={unidades.map((u) => ({ value: u.id, label: rotulo(u) }))} value={f.pai} onChange={(v) => setF({ ...f, pai: v })} comboboxProps={{ zIndex: 500 }} />
        <Text size="xs" c="dimmed">O local também aparece em "Estrutura da mina", onde pode ser renomeado ou movido.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>Cancelar</Button>
          <Button disabled={!f.codigo.trim() || !tipo} loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>Cadastrar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
