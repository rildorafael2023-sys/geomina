import { Alert, Button, NumberInput, Paper, Select, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, CRS_OPCOES, ErroApi, json } from "../../api/cliente";

export function CadastroMina() {
  const qc = useQueryClient();
  const [f, setF] = useState({ codigo: "", nome: "", srid: "31983", declinacao: "" as number | string, obs: "" });
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () =>
      api("/minas", {
        method: "POST",
        body: json({
          codigo: f.codigo,
          nome: f.nome,
          srid_trabalho: Number(f.srid),
          declinacao_magnetica: f.declinacao === "" ? null : Number(f.declinacao),
          observacoes: f.obs || null,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["minas"] }),
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao cadastrar a mina."),
  });
  return (
    <Paper withBorder p="lg" maw={560}>
      <Stack>
        <Title order={4}>Cadastrar a mina</Title>
        <Text size="sm" c="dimmed">
          Primeiro passo: informe a mina e o sistema de coordenadas de trabalho. Todas as coordenadas (topografia, amostras,
          frentes) serão guardadas nesse sistema; dados em outro sistema só serão convertidos com a sua confirmação.
        </Text>
        {erro && <Alert color="red">{erro}</Alert>}
        <TextInput label="Código" placeholder="ex.: MINA01" required value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value })} />
        <TextInput label="Nome" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} />
        <Select label="Sistema de coordenadas de trabalho" data={CRS_OPCOES} value={f.srid} onChange={(v) => setF({ ...f, srid: v ?? "31983" })} allowDeselect={false} />
        <NumberInput
          label="Declinação magnética (graus, opcional)"
          description="Positiva para leste. Usada nas medidas estruturais feitas com bússola."
          decimalSeparator=","
          value={f.declinacao}
          onChange={(v) => setF({ ...f, declinacao: v })}
          min={-90}
          max={90}
        />
        <Textarea label="Observações" value={f.obs} onChange={(e) => setF({ ...f, obs: e.currentTarget.value })} />
        <Button loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>
          Cadastrar mina
        </Button>
      </Stack>
    </Paper>
  );
}
