import { Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api, type Amostra, type Eu, type Mina } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { ResultadosAmostra } from "../amostras/Amostras";
import { PainelDocumentos } from "../documentos/PainelDocumentos";

/** Consulta completa da amostra (dados, resultados, ficha, fotos e croquis). Reutilizada no 3D. */
export function ConsultaAmostra({ id, mina, eu, fechar }: { id: string; mina: Mina; eu: Eu; fechar: () => void }) {
  const a = useQuery({ queryKey: ["amostra", id], queryFn: () => api<Amostra>(`/amostras/${id}`) });
  const dic = useDicionarios();
  const nome = (t: string | null) => (t ? dic.porId.get(t)?.nome ?? "" : "");
  const linha = (rotulo: string, valor: React.ReactNode) => valor ? <Group gap="xs" wrap="nowrap"><Text size="sm" c="dimmed" w={150}>{rotulo}</Text><Text size="sm">{valor}</Text></Group> : null;
  return (
    <Modal opened onClose={fechar} size="xl" title={a.data ? `Amostra ${a.data.codigo}` : "Amostra"}>
      {!a.data ? <Loader size="sm" /> : (
        <Stack gap="sm">
          <Stack gap={2}>
            {linha("Local", [a.data.unidade, a.data.local_descricao].filter(Boolean).join(" — "))}
            {linha("Coordenadas", a.data.x != null ? `E ${a.data.x.toFixed(2)} · N ${a.data.y?.toFixed(2)} · Z ${a.data.z?.toFixed(2) ?? "—"} (EPSG:${a.data.srid})` : "não informadas")}
            {linha("Coleta", a.data.data_coleta ? new Date(a.data.data_coleta + "T00:00").toLocaleDateString("pt-BR") : null)}
            {linha("Responsável", a.data.responsavel)}
            {linha("Litologia", a.data.litologia)}
            {linha("Alteração", nome(a.data.alteracao_id))}
            {linha("Mineralização", nome(a.data.mineralizacao_id))}
            {linha("Seção (de–até)", a.data.secao_de_m != null ? `${a.data.secao_de_m} – ${a.data.secao_ate_m} m` : null)}
            {linha("Descrição", a.data.descricao)}
            {linha("Observações", a.data.observacoes)}
            {linha("Ficha de mapeamento", a.data.mapeamento_id ? <Link to={`/mapeamento/${a.data.mapeamento_id}`} onClick={fechar}>{a.data.ficha}</Link> : null)}
            {linha("Lotes", a.data.lotes.join(", "))}
          </Stack>
          <Text fw={600} size="sm">Resultados</Text>
          <ResultadosAmostra id={id} />
          {a.data.mapeamento_id && eu.permissoes.includes("arquivo:ler") && (
            <>
              <Text fw={600} size="sm">Fotos e croquis da ficha</Text>
              <PainelDocumentos minaId={mina.id} mapeamentoId={a.data.mapeamento_id} podeEnviar={false} compacto />
            </>
          )}
          <Group><Button component={Link} to="/amostras" variant="light" size="xs" onClick={fechar}>Abrir em Amostras</Button></Group>
        </Stack>
      )}
    </Modal>
  );
}
