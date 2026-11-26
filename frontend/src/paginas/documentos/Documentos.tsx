import { Alert, Loader, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api, type Eu, type Mina } from "../../api/cliente";
import { PainelDocumentos } from "./PainelDocumentos";

export function Documentos({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina antes de enviar documentos.</Alert>;
  return (
    <Stack>
      <div>
        <Title order={3}>Fotos, croquis e documentos</Title>
        <Text size="sm" c="dimmed">Arquivos originais preservados, com versões. Para vincular a um local ou ficha, envie pela unidade (Estrutura da mina) ou pela ficha.</Text>
      </div>
      <PainelDocumentos minaId={mina.id} podeEnviar={eu.permissoes.includes("arquivo:enviar")} />
    </Stack>
  );
}
