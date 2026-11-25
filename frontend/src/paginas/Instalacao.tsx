import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState, type FormEvent } from "react";

import { api, ErroApi, json, type RespostaLogin } from "../api/cliente";

export function Instalacao({ aoConcluir }: { aoConcluir: (token: string) => void }) {
  const [f, setF] = useState({ login: "", nome: "", email: "", senha: "", confirmacao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value }),
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (f.senha !== f.confirmacao) return setErro("As senhas não conferem.");
    setEnviando(true);
    try {
      const r = await api<RespostaLogin>("/instalacao/admin", {
        method: "POST",
        body: json({ login: f.login, nome: f.nome, email: f.email || null, senha: f.senha }),
      });
      aoConcluir(r.token);
    } catch (err) {
      setErro(err instanceof ErroApi ? err.message : "Falha ao criar o administrador.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w="100%" maw={440} component="form" onSubmit={enviar}>
        <Stack>
          <div>
            <Title order={3}>Primeiro acesso</Title>
            <Text size="sm" c="dimmed">
              Crie o administrador deste computador. Os dados ficam somente nesta máquina.
            </Text>
          </div>
          {erro && <Alert color="red">{erro}</Alert>}
          <TextInput label="Login" description="Letras, números, ponto, hífen ou sublinhado" required {...campo("login")} />
          <TextInput label="Nome completo" required {...campo("nome")} />
          <TextInput label="E-mail (opcional)" {...campo("email")} />
          <PasswordInput label="Senha" description="Mínimo de 8 caracteres, com letras e números" required {...campo("senha")} />
          <PasswordInput label="Confirme a senha" required {...campo("confirmacao")} />
          <Button type="submit" loading={enviando}>
            Criar administrador
          </Button>
        </Stack>
      </Paper>
    </Center>
  );
}
