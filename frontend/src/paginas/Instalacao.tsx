import { Alert, Button, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";

import { api, ErroApi, json, type RespostaLogin } from "../api/cliente";
import { TelaEntrada } from "../componentes/ui";

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
    <TelaEntrada largura={440}>
      <form onSubmit={enviar}>
        <Stack gap="sm">
          <div>
            <Text fw={600} size="lg">Primeiro acesso</Text>
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
          <Button type="submit" size="sm" loading={enviando}>
            Criar administrador
          </Button>
        </Stack>
      </form>
    </TelaEntrada>
  );
}
