import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState, type FormEvent } from "react";

import { api, ErroApi, json } from "../api/cliente";

export function TrocarSenha({ obrigatoria = false, aoConcluir }: { obrigatoria?: boolean; aoConcluir: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nova !== conf) return setErro("As senhas não conferem.");
    try {
      await api("/auth/senha", { method: "POST", body: json({ senha_atual: atual, nova_senha: nova }) });
      notifications.show({ color: "teal", message: "Senha alterada. Entre novamente com a nova senha." });
      aoConcluir();
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Falha ao trocar a senha.");
    }
  }

  const form = (
    <Paper withBorder p="xl" w="100%" maw={400} component="form" onSubmit={enviar}>
      <Stack>
        <Title order={4}>{obrigatoria ? "Defina uma nova senha" : "Trocar minha senha"}</Title>
        {obrigatoria && (
          <Text size="sm" c="dimmed">
            Sua senha foi criada ou redefinida pelo administrador. Defina uma senha pessoal para continuar.
          </Text>
        )}
        {erro && <Alert color="red">{erro}</Alert>}
        <PasswordInput label="Senha atual" value={atual} onChange={(e) => setAtual(e.currentTarget.value)} required />
        <PasswordInput label="Nova senha" value={nova} onChange={(e) => setNova(e.currentTarget.value)} required />
        <PasswordInput label="Confirme a nova senha" value={conf} onChange={(e) => setConf(e.currentTarget.value)} required />
        <Button type="submit">Salvar</Button>
      </Stack>
    </Paper>
  );
  return obrigatoria ? (
    <Center mih="100vh" p="md">
      {form}
    </Center>
  ) : (
    form
  );
}
