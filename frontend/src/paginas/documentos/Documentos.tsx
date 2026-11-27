import { Alert, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api, type Eu, type Mina } from "../../api/cliente";
import { PainelDocumentos } from "./PainelDocumentos";
import { IconPhoto } from "@tabler/icons-react";
import { Pagina } from "../../componentes/ui";

export function Documentos({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina antes de enviar documentos.</Alert>;
  return (
    <Pagina titulo="Fotos, croquis e documentos" icone={<IconPhoto size={20} />} subtitulo={<>Arquivos originais preservados, com versões. Para vincular a um local ou ficha, envie pela unidade (Estrutura da mina) ou pela ficha.</>}>
      <PainelDocumentos minaId={mina.id} podeEnviar={eu.permissoes.includes("arquivo:enviar")} />
    </Pagina>
  );
}
