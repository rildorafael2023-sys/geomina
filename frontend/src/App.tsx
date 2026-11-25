import { Center, Loader } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { aoSessaoExpirar, api, definirToken, lerToken, type Eu } from "./api/cliente";
import { Layout } from "./componentes/Layout";
import { Inicio } from "./paginas/Inicio";
import { Instalacao } from "./paginas/Instalacao";
import { Login } from "./paginas/Login";
import { Sistema } from "./paginas/Sistema";
import { TrocarSenha } from "./paginas/TrocarSenha";
import { Usuarios } from "./paginas/Usuarios";

export function App() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(lerToken());

  useEffect(() => aoSessaoExpirar(() => setToken(null)), []);

  const instalacao = useQuery({
    queryKey: ["instalacao"],
    queryFn: () => api<{ precisa_admin: boolean }>("/instalacao"),
  });
  const eu = useQuery({ queryKey: ["eu", token], queryFn: () => api<Eu>("/auth/eu"), enabled: !!token });

  const entrar = (t: string) => {
    definirToken(t);
    setToken(t);
    qc.invalidateQueries();
  };
  const sair = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    definirToken(null);
    setToken(null);
    qc.clear();
  };

  if (instalacao.isLoading || (token && eu.isLoading)) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (instalacao.data?.precisa_admin) return <Instalacao aoConcluir={entrar} />;
  if (!token || !eu.data) return <Login aoEntrar={entrar} />;
  if (eu.data.trocar_senha) return <TrocarSenha obrigatoria aoConcluir={sair} />;

  const usuario = eu.data;
  return (
    <Layout usuario={usuario} aoSair={sair}>
      <Routes>
        <Route path="/" element={<Inicio usuario={usuario} />} />
        {usuario.permissoes.includes("usuario:gerenciar") && <Route path="/usuarios" element={<Usuarios eu={usuario} />} />}
        <Route path="/sistema" element={<Sistema />} />
        <Route path="/senha" element={<TrocarSenha aoConcluir={sair} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
