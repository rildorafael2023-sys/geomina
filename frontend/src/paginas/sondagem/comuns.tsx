import { ActionIcon, Badge, Button, Chip, Group, Modal, ScrollArea, Slider, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";

import { urlArquivo } from "../../api/cliente";
import { m } from "../../componentes/perfil";
import type { FotoP } from "./tipos";

/** URL (blob) de uma foto protegida por login; ``tipo`` miniatura ou original. */
export function useUrlFoto(foto: FotoP | null, tipo: "miniatura" | "original" = "miniatura") {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let atual: string | null = null;
    setUrl(null);
    if (foto && foto.mime?.startsWith("image/")) {
      const t = tipo === "original" && foto.mime === "image/tiff" ? "previa" : tipo;
      urlArquivo(`/documentos/${foto.documento_id}/versoes/${foto.versao}/arquivo?tipo=${t}`).then((u) => setUrl((atual = u))).catch(() => setUrl(null));
    }
    return () => { if (atual) URL.revokeObjectURL(atual); };
  }, [foto?.documento_id, foto?.versao, foto?.mime, tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}

export function Miniatura({ foto, altura = 110, aoAbrir, rotulo = true }: { foto: FotoP; altura?: number; aoAbrir: () => void; rotulo?: boolean }) {
  const url = useUrlFoto(foto);
  return (
    <div style={{ cursor: "pointer" }} onClick={aoAbrir} onDoubleClick={aoAbrir}>
      <div style={{ height: altura, background: "#212529", borderRadius: 4, overflow: "hidden", position: "relative" }}>
        {url ? <img src={url} alt={foto.titulo} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Text size="xs" c="gray.5" ta="center" pt={altura / 2 - 8}>{foto.mime === "application/pdf" ? "PDF" : "…"}</Text>}
        <Badge size="xs" variant="filled" color="dark" style={{ position: "absolute", left: 4, bottom: 4 }}>Detalhe</Badge>
      </div>
      {rotulo && (
        <Group gap={4} mt={2} wrap="nowrap">
          <Text size="xs" fw={600}>{foto.de != null ? `${m(foto.de)} a ${m(foto.ate)} m` : "sem intervalo"}</Text>
          {foto.caixa && <Text size="xs" c="dimmed">Caixa {foto.caixa}</Text>}
        </Group>
      )}
    </div>
  );
}

/** Foto grande com zoom e rotação; o arquivo original nunca é alterado. */
export function VisorFoto({ foto, aoFechar, extra }: { foto: FotoP; aoFechar: () => void; extra?: React.ReactNode }) {
  const url = useUrlFoto(foto, "original");
  const [zoom, setZoom] = useState(1);
  const [giro, setGiro] = useState(0);
  return (
    <Modal opened onClose={aoFechar} size="90%" title={<Text fw={600}>{foto.titulo}</Text>} zIndex={500}>
      <Stack gap="xs">
        <Group gap="xs">
          <Text size="xs">Zoom</Text>
          <Slider w={180} min={0.5} max={4} step={0.1} value={zoom} onChange={setZoom} label={(v) => `${Math.round(v * 100)}%`} />
          <Button size="compact-xs" variant="default" onClick={() => setGiro((g) => g - 90)}>⟲ Girar</Button>
          <Button size="compact-xs" variant="default" onClick={() => setGiro((g) => g + 90)}>⟳ Girar</Button>
          <Button size="compact-xs" variant="subtle" onClick={() => { setZoom(1); setGiro(0); }}>Original</Button>
          {url && <Button size="compact-xs" variant="subtle" component="a" href={url} download={foto.titulo}>Baixar original</Button>}
          <Text size="xs" c="dimmed">{foto.de != null ? `${m(foto.de)} a ${m(foto.ate)} m` : ""}{foto.caixa ? ` · caixa ${foto.caixa}` : ""}{foto.legenda ? ` · ${foto.legenda}` : ""}</Text>
        </Group>
        <ScrollArea h="70vh" style={{ background: "#212529", borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "70vh", padding: 8 }}>
            {url ? <img src={url} alt={foto.titulo} style={{ transform: `rotate(${giro}deg) scale(${zoom})`, transformOrigin: "center", maxWidth: "100%", maxHeight: "68vh", transition: "transform .15s" }} />
              : <Text c="gray.4">carregando…</Text>}
          </div>
        </ScrollArea>
        {extra}
      </Stack>
    </Modal>
  );
}

/** Painel de elementos agrupados por unidade (ppm, %, ppb…) com atalhos Padrão / Maiores / Todos, como no vídeo. */
export function SeletorElementos({ disponiveis, grupos, unidades, valor, aoMudar, padrao }: {
  disponiveis: string[]; grupos: Record<string, string>; unidades: Record<string, string>; valor: string[]; aoMudar: (v: string[]) => void; padrao: string[];
}) {
  const [busca, setBusca] = useState("");
  const ordem = ["ppm", "%", "ppb", "outras"];
  const NOMES: Record<string, string> = { ppm: "PPM", "%": "%", ppb: "PPB", outras: "Sem unidade / outras" };
  const filtra = (a: string) => !busca.trim() || a.toLowerCase().includes(busca.trim().toLowerCase());
  const alternar = (a: string) => aoMudar(valor.includes(a) ? valor.filter((x) => x !== a) : [...valor, a]);
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">Elementos no perfil · {valor.length}</Text>
        <ActionIcon size="xs" variant="subtle" onClick={() => aoMudar([])} aria-label="Limpar elementos">✕</ActionIcon>
      </Group>
      <Group gap={4}>
        <Button size="compact-xs" variant="default" onClick={() => aoMudar(padrao)}>Padrão</Button>
        <Button size="compact-xs" variant="default" onClick={() => aoMudar(disponiveis.filter((a) => grupos[a] === "%"))}>Maiores (%)</Button>
        <Button size="compact-xs" variant="default" onClick={() => aoMudar(disponiveis)}>Todos</Button>
      </Group>
      <TextInput size="xs" placeholder="Buscar elemento" value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
      {!disponiveis.length && <Text size="xs" c="dimmed">Nenhum teor de laudo nas amostras deste furo.</Text>}
      {ordem.map((g) => {
        const lista = disponiveis.filter((a) => (grupos[a] ?? "outras") === g && filtra(a));
        if (!lista.length) return null;
        return (
          <div key={g}>
            <Text size="10px" fw={700} c="dimmed" mb={2}>{NOMES[g]}</Text>
            <Group gap={3}>
              {lista.map((a) => (
                <Chip key={a} size="xs" radius="sm" checked={valor.includes(a)} onChange={() => alternar(a)} title={unidades[a]}>{a}</Chip>
              ))}
            </Group>
          </div>
        );
      })}
    </Stack>
  );
}

/** Ícone da ocorrência (esmeralda = gema verde; água = gota; demais = círculo com sigla). */
export function IconeOcorrencia({ tipo, x, y, r = 7 }: { tipo: string; x: number; y: number; r?: number }) {
  if (tipo === "esmeralda")
    return <g><polygon points={`${x - r},${y - r / 3} ${x - r / 2},${y - r} ${x + r / 2},${y - r} ${x + r},${y - r / 3} ${x},${y + r}`} fill="#2b8a3e" stroke="#0b5d1e" strokeWidth={0.8} /><title>Esmeralda</title></g>;
  if (tipo === "agua")
    return <g><path d={`M${x} ${y - r} C ${x + r} ${y}, ${x + r * 0.7} ${y + r}, ${x} ${y + r} C ${x - r * 0.7} ${y + r}, ${x - r} ${y}, ${x} ${y - r} Z`} fill="#4dabf7" stroke="#1971c2" strokeWidth={0.8} /><title>Água</title></g>;
  const cores: Record<string, [string, string]> = { molibdenita: ["#868e96", "Mo"], carbonato: ["#c0a274", "C"], sulfeto: ["#e0b400", "S"], berilo: ["#94d82d", "B"], perda: ["#ced4da", "—"] };
  const [cor, letra] = cores[tipo] ?? ["#adb5bd", "?"];
  return <g><circle cx={x} cy={y} r={r} fill={cor} stroke="#495057" strokeWidth={0.6} /><text x={x} y={y + 3} fontSize={r} textAnchor="middle" fill="#fff" fontWeight={700}>{letra}</text><title>{tipo}</title></g>;
}
