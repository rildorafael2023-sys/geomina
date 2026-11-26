import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { api, dataCurta, dataHora, ESTADOS_FICHA, type Ficha, type Mina } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { ColunaSecao, Estereograma } from "../../geologia/Graficos";

// Ficha para impressão (A4). Sem id: ficha em branco, com os mesmos campos, para uso em campo sem tablet.
// "Salvar como PDF" é feito pela própria janela de impressão do Windows.
const NORTES: Record<string, string> = { magnetico: "magnético", quadricula: "quadrícula", verdadeiro: "verdadeiro" };
const borda = "1px solid #555";
const cel = { border: borda, padding: "3px 5px", fontSize: 11, verticalAlign: "top" as const };
const cab = { ...cel, background: "#eee", fontWeight: 600 };

export function FichaImpressao({ id, mina }: { id?: string; mina: Mina }) {
  const dic = useDicionarios();
  const q = useQuery({ queryKey: ["ficha", id], queryFn: () => api<Ficha>(`/mapeamentos/${id}`), enabled: !!id });
  if ((id && q.isLoading) || dic.isLoading) return <Loader />;
  const f = q.data;
  const t = (i: string | null | undefined) => (i ? f?.termos[i] ?? dic.porId.get(i) : undefined);
  const nome = (i: string | null | undefined) => t(i)?.nome ?? "";
  const num = (v: number | null | undefined, sufixo = "") => (v === null || v === undefined ? "" : `${v.toLocaleString("pt-BR")}${sufixo}`);
  const linhasVazias = (k: number, cols: number) =>
    Array.from({ length: k }, (_, r) => (
      <tr key={`v${r}`}>{Array.from({ length: cols }, (_, c) => <td key={c} style={{ ...cel, height: 22 }} />)}</tr>
    ));

  return (
    <Stack gap="xs" maw={820} mx="auto" className="ficha-impressao" style={{ color: "#000", background: "#fff", padding: 8 }}>
      <Group justify="space-between" className="nao-imprimir">
        <Button variant="subtle" component={Link} to={f ? `/mapeamento/${f.id}` : "/mapeamento"}>Voltar</Button>
        <Button onClick={() => window.print()}>Imprimir / salvar PDF</Button>
      </Group>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr>
            <td style={{ ...cel, fontSize: 15, fontWeight: 700 }} colSpan={4}>
              FICHA DE MAPEAMENTO GEOLÓGICO — {mina.nome} {f ? `· ${f.numero}` : ""}
            </td>
            <td style={cel} colSpan={2}>Situação: {f ? `${ESTADOS_FICHA[f.estado].rotulo}${f.revisao ? ` (rev. ${f.revisao})` : ""}` : ""}</td>
          </tr>
          <tr>
            <Campo r="Local">{f?.unidade_caminho.join(" › ")}</Campo>
            <Campo r="Data">{f ? `${dataCurta(f.data)} ${f.hora ?? ""}` : ""}</Campo>
            <Campo r="Geólogo">{f?.geologo}</Campo>
          </tr>
          <tr>
            <Campo r="Exposição">{nome(f?.exposicao_id) || (f ? "" : "frente / parede esq. / parede dir. / teto / piso / pilar")}</Campo>
            <Campo r="Posição">{f?.distancia_m !== null && f?.distancia_m !== undefined ? `${num(f.distancia_m, " m")} de ${f.referencia}` : f ? "" : "____ m a partir de ____________"}</Campo>
            <Campo r="Seção (L × A)">{f ? `${num(f.largura_m, " m") || "—"} × ${num(f.altura_m, " m") || "—"}` : "____ × ____ m"}</Campo>
          </tr>
          <tr>
            <Campo r="X / Y / Z">{f && f.x !== null ? `${num(f.x)} / ${num(f.y)} / ${num(f.z)}` : ""}</Campo>
            <Campo r="Az. eixo">{num(f?.azimute_eixo, "°")}</Campo>
            <Campo r="Norte / decl.">{f ? `${NORTES[f.norte_referencia]} / ${num(f.declinacao, "°") || "—"}` : "mag. / quadr. · decl. ____°"}</Campo>
          </tr>
        </tbody>
      </table>

      <Group align="flex-start" wrap="nowrap" gap="xs">
        <table style={{ borderCollapse: "collapse", flex: 1 }}>
          <thead>
            <tr><td style={cab} colSpan={6}>B. SEÇÃO (do piso para o teto)</td></tr>
            <tr>{["De", "Até", "Litologia", "Alteração / int.", "Mineralização", "Contato"].map((h) => <td key={h} style={cab}>{h}</td>)}</tr>
          </thead>
          <tbody>
            {f?.intervalos.map((i) => (
              <tr key={i.id}>
                <td style={cel}>{num(i.de_m)}</td>
                <td style={cel}>{num(i.ate_m)}</td>
                <td style={cel}>{nome(i.litologia_id)}{i.descricao ? <div style={{ fontSize: 10 }}>{i.descricao}</div> : null}</td>
                <td style={cel}>{[nome(i.alteracao_id), nome(i.intensidade_id)].filter(Boolean).join(" / ")}</td>
                <td style={cel}>{[nome(i.mineralizacao_id), i.minerais, i.percentual !== null ? `${i.percentual}%` : ""].filter(Boolean).join(" · ")}</td>
                <td style={cel}>{nome(i.contato_id)}</td>
              </tr>
            ))}
            {!f && linhasVazias(8, 6)}
          </tbody>
        </table>
        <div style={{ border: borda, padding: 4 }}>
          {f ? (
            <ColunaSecao alturaPx={200} altura={f.altura_m} faixas={f.intervalos.map((i) => ({ de: i.de_m, ate: i.ate_m, cor: t(i.litologia_id)?.cor ?? "#ccc", sigla: t(i.litologia_id)?.sigla ?? "" }))} />
          ) : (
            <div style={{ width: 150, height: 200 }}><Text size="xs">Coluna</Text></div>
          )}
        </div>
      </Group>

      <Group align="flex-start" wrap="nowrap" gap="xs">
        <table style={{ borderCollapse: "collapse", flex: 1 }}>
          <thead>
            <tr><td style={cab} colSpan={5}>C. MEDIDAS ESTRUTURAIS (dir. mergulho/mergulho · rumo/caimento)</td></tr>
            <tr>{["Tipo", "Medida", "Família", "Esp./preench.", "Obs."].map((h) => <td key={h} style={cab}>{h}</td>)}</tr>
          </thead>
          <tbody>
            {f?.medidas.map((m) => (
              <tr key={m.id}>
                <td style={cel}>{t(m.tipo_id)?.sigla ?? nome(m.tipo_id)}</td>
                <td style={cel}>{m.classe === "planar" ? `${m.dip_dir}/${m.dip}` : `${m.trend}→${m.plunge}`}{m.convencao === "strike_rhr_dip" ? ` (digitado RHR ${m.valor_digitado?.a}/${m.valor_digitado?.b})` : ""}</td>
                <td style={cel}>{m.familia}</td>
                <td style={cel}>{[num(m.espessura_m, " m"), m.preenchimento].filter(Boolean).join(" · ")}</td>
                <td style={cel}>{m.observacao}</td>
              </tr>
            ))}
            {!f && linhasVazias(7, 5)}
          </tbody>
        </table>
        <div style={{ border: borda, padding: 4 }}>
          <Estereograma tamanho={200} medidas={(f?.medidas ?? []).map((m) => ({ ...m, rotulo: "", cor: m.classe === "linear" ? "#2f9e44" : "#1c4f8a" }))} />
        </div>
      </Group>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr><td style={cab} colSpan={5}>D. AMOSTRAS COLETADAS</td></tr>
          <tr>{["Código", "De–até (m)", "Tipo", "Destino", "Leitura de campo (não laboratorial)"].map((h) => <td key={h} style={cab}>{h}</td>)}</tr>
        </thead>
        <tbody>
          {f?.amostras.map((a) => (
            <tr key={a.id}>
              <td style={cel}>{a.codigo}</td>
              <td style={cel}>{a.de_m !== null ? `${num(a.de_m)}–${num(a.ate_m)}` : ""}</td>
              <td style={cel}>{a.tipo}</td>
              <td style={cel}>{nome(a.destino_id)}</td>
              <td style={cel}>{a.leitura_campo}</td>
            </tr>
          ))}
          {!f && linhasVazias(4, 5)}
        </tbody>
      </table>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr><td style={cab}>E/F. DESCRIÇÃO, INTERPRETAÇÃO E CROQUI</td></tr>
          <tr><td style={{ ...cel, height: f ? undefined : 180, whiteSpace: "pre-wrap" }}>{f?.descricao}</td></tr>
          <tr><td style={cel}>Água: {nome(f?.agua_id) || (f ? "" : "seca / úmida / gotejamento / fluxo")}{f?.obs_geotecnicas ? ` · Obs. geotécnicas: ${f.obs_geotecnicas}` : ""}</td></tr>
        </tbody>
      </table>
      <Text size="xs">
        {f
          ? `Emitida pelo GeoMina em ${dataHora(new Date().toISOString())}.${f.revisado_por ? ` Revisada por ${f.revisado_por} em ${dataHora(f.revisado_em!)}.` : ""}`
          : "Geólogo: ______________________   Revisor: ______________________   Data da revisão: ____/____/______"}
      </Text>
    </Stack>
  );
}

function Campo({ r, children }: { r: string; children: ReactNode }) {
  return (
    <>
      <td style={cab}>{r}</td>
      <td style={{ ...cel, minWidth: 90 }}>{children}</td>
    </>
  );
}
