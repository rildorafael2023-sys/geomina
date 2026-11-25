import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState, type FormEvent } from "react";

import { api, ErroApi, json, type RespostaLogin } from "../api/cliente";

export function Login({ aoEntrar }: { aoEntrar: (token: string) => void }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await api<RespostaLogin>("/auth/login", { method: "POST", body: json({ login, senha }) });
      aoEntrar(r.token);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Não foi possível conectar ao aplicativo local.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w="100%" maw={380} component="form" onSubmit={enviar}>
        <Stack>
          <div>
            <Title order={3}>GeoMina</Title>
            <Text size="sm" c="dimmed">
              Gestão de dados geológicos — aplicativo local
            </Text>
          </div>
          {erro && <Alert color="red">{erro}</Alert>}
          <TextInput label="Login" value={login} onChange={(e) => setLogin(e.currentTarget.value)} required autoFocus />
          <PasswordInput label="Senha" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} required />
          <Button type="submit" loading={enviando}>
            Entrar
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
