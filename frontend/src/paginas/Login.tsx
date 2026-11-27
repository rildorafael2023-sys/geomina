import { Alert, Button, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";

import { api, ErroApi, json, type RespostaLogin } from "../api/cliente";
import { TelaEntrada } from "../componentes/ui";

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
    <TelaEntrada largura={380}>
      <form onSubmit={enviar}>
        <Stack gap="sm">
          <Text fw={600} size="lg">Entrar</Text>
          {erro && <Alert color="red">{erro}</Alert>}
          <TextInput size="sm" label="Login" value={login} onChange={(e) => setLogin(e.currentTarget.value)} required autoFocus />
          <PasswordInput size="sm" label="Senha" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} required />
          <Button type="submit" size="sm" loading={enviando}>
            Entrar
          </Button>
        </Stack>
      </form>
    </TelaEntrada>
  );
}
