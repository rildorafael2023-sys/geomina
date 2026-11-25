import { Alert, Button, Modal, MultiSelect, NumberInput, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, ErroApi, json, type Mina, type TipoUnidade, type UnidadeDetalhe, type UnidadeResumo } from "../../api/cliente";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  mina: Mina;
  tipos: TipoUnidade[];
  tiposPermitidos: string[];
  pai: UnidadeResumo | null;
  niveisDisponiveis: UnidadeResumo[];
  aoCriar: (id: string) => void;
}

export function FormUnidade({ aberto, aoFechar, mina, tipos, tiposPermitidos, pai, niveisDisponiveis, aoCriar }: Props) {
  const qc = useQueryClient();
  const opcoes = tipos.filter((t) => t.ativo && tiposPermitidos.includes(t.codigo));
  const [f, setF] = useState({ tipo: "", codigo: "", nome: "", cota: "" as number | string, descricao: "", niveis: [] as string[] });
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) {
      setErro(null);
      setF({ tipo: opcoes[0]?.codigo ?? "", codigo: "", nome: "", cota: "", descricao: "", niveis: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const tipo = tipos.find((t) => t.codigo === f.tipo);
  const salvar = useMutation({
    mutationFn: () =>
      api<UnidadeDetalhe>("/unidades", {
        method: "POST",
        body: json({
          mina_id: mina.id,
          tipo: f.tipo,
          pai_id: pai?.id ?? null,
          codigo: f.codigo,
          nome: f.nome || f.codigo,
          cota_referencia: f.cota === "" ? null : Number(f.cota),
          descricao: f.descricao || null,
          niveis: tipo?.multinivel ? f.niveis : [],
        }),
      }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["unidades"] });
      qc.invalidateQueries({ queryKey: ["unidade", pai?.id] });
      notifications.show({ color: "teal", message: `Unidade ${u.codigo} cadastrada (${u.tipo_nome}).` });
      aoFechar();
      aoCriar(u.id);
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });

  return (
    <Modal opened={aberto} onClose={aoFechar} title={pai ? `Nova unidade dentro de ${pai.codigo}` : "Nova unidade na raiz da mina"}>
      <Stack>
        {erro && <Alert color="red">{erro}</Alert>}
        {opcoes.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nenhum tipo de unidade pode ser criado aqui pelas regras de hierarquia atuais.
          </Text>
        ) : (
          <>
            <Select label="Tipo" data={opcoes.map((t) => ({ value: t.codigo, label: t.nome }))} value={f.tipo} onChange={(v) => setF({ ...f, tipo: v ?? "" })} allowDeselect={false} />
            <TextInput label="Código" description="Único na mina. Ex.: N144, GAL-01, TR-1F, RAMPA-SUL" required value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value })} />
            <TextInput label="Nome" description="Se vazio, usa o código" value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} />
            {tipo?.e_nivel && (
              <NumberInput label="Cota de referência (m)" decimalSeparator="," value={f.cota} onChange={(v) => setF({ ...f, cota: v })} />
            )}
            {tipo?.multinivel && (
              <MultiSelect
                label="Níveis que esta unidade atravessa"
                data={niveisDisponiveis.map((n) => ({ value: n.id, label: `${n.codigo} — ${n.nome}` }))}
                value={f.niveis}
                onChange={(v) => setF({ ...f, niveis: v })}
                searchable
              />
            )}
            <Textarea label="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.currentTarget.value })} />
            <Button loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>
              Salvar
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
