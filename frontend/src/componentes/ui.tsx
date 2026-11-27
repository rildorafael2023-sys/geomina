/** Componentes padrão do GeoMina (design system). Ver docs/INTERFACE.md. */
import { Button, Center, Group, Loader, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { IconArrowsSort, IconDatabaseOff, IconSearch, IconSortAscending, IconSortDescending, IconX } from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

/** Cabeçalho padrão de página: ícone, título, contexto e ações principais à direita. */
export function Pagina({ titulo, subtitulo, icone, acoes, children, className }: {
  titulo: ReactNode; subtitulo?: ReactNode; icone?: ReactNode; acoes?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <div className={`gm-pagina ${className ?? ""}`}>
      <div className="gm-pagina-cab">
        <div className="gm-pagina-titulo">
          {icone && <span style={{ color: "var(--mantine-color-geo-7)", display: "flex" }}>{icone}</span>}
          <div style={{ minWidth: 0 }}>
            <h1>{titulo}</h1>
            {subtitulo && <div className="gm-pagina-sub">{subtitulo}</div>}
          </div>
        </div>
        {acoes && <div className="gm-pagina-acoes nao-imprimir">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}

/** Painel branco com barra de título; ``p={0}`` para tabelas encostadas na borda. */
export function Painel({ titulo, descricao, acoes, children, p = 10, style, className, testId }: {
  titulo?: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children?: ReactNode; p?: number | string; style?: React.CSSProperties; className?: string; testId?: string;
}) {
  return (
    <section className={`gm-painel ${className ?? ""}`} style={style} data-testid={testId}>
      {(titulo || acoes) && (
        <div className="gm-painel-cab">
          {titulo && <h2>{titulo}</h2>}
          {descricao && <span className="gm-painel-desc">{descricao}</span>}
          {acoes && <div className="gm-painel-acoes nao-imprimir">{acoes}</div>}
        </div>
      )}
      <div style={{ padding: p }}>{children}</div>
    </section>
  );
}

/** Faixa de filtros numa linha; ``fim`` fica à direita (contagem, limpar, exportar). */
export function BarraFiltros({ children, fim, aoLimpar }: { children: ReactNode; fim?: ReactNode; aoLimpar?: () => void }) {
  return (
    <div className="gm-filtros nao-imprimir">
      {children}
      {(fim || aoLimpar) && (
        <div className="gm-filtros-fim">
          {fim}
          {aoLimpar && <Button variant="subtle" color="gray" leftSection={<IconX size={14} />} onClick={aoLimpar}>Limpar filtros</Button>}
        </div>
      )}
    </div>
  );
}

export interface Indicador { rotulo: string; valor: ReactNode; detalhe?: ReactNode; para?: string; cor?: string }

/** Indicadores compactos numa só faixa (não competem com o conteúdo). */
export function Indicadores({ itens }: { itens: Indicador[] }) {
  return (
    <div className="gm-indicadores">
      {itens.map((i) => {
        const corpo = (
          <>
            <div className="gm-indicador-rotulo">{i.rotulo}</div>
            <div className="gm-indicador-valor" style={i.cor ? { color: i.cor } : undefined}>{i.valor}</div>
            {i.detalhe && <div className="gm-indicador-detalhe">{i.detalhe}</div>}
          </>
        );
        return i.para ? <Link key={i.rotulo} to={i.para} className="gm-indicador">{corpo}</Link> : <div key={i.rotulo} className="gm-indicador">{corpo}</div>;
      })}
    </div>
  );
}

/** Estado vazio padrão: ícone, mensagem e, se houver, a ação que resolve. */
export function Vazio({ titulo, descricao, acao, icone, compacto }: { titulo: string; descricao?: ReactNode; acao?: ReactNode; icone?: ReactNode; compacto?: boolean }) {
  return (
    <Center py={compacto ? 14 : 36} px="md">
      <Stack gap={6} align="center" maw={520}>
        <span style={{ color: "#9aa6b2" }}>{icone ?? <IconDatabaseOff size={compacto ? 22 : 30} stroke={1.4} />}</span>
        <Text fw={600} size="sm" ta="center">{titulo}</Text>
        {descricao && <Text size="xs" c="dimmed" ta="center">{descricao}</Text>}
        {acao}
      </Stack>
    </Center>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <Group gap="xs" p="md"><Loader size="xs" /><Text size="sm" c="dimmed">{texto}</Text></Group>
  );
}

export interface Coluna<T> {
  chave: string;
  titulo: ReactNode;
  /** Conteúdo da célula; sem ``render`` mostra ``valor``. */
  render?: (l: T) => ReactNode;
  /** Valor usado para ordenar, buscar e exportar. */
  valor?: (l: T) => string | number | null | undefined;
  numero?: boolean;
  largura?: number | string;
  fixa?: boolean;
  ordenavel?: boolean;
  dica?: string;
}

/**
 * Tabela de dados padrão: cabeçalho fixo, ordenação por coluna, busca, coluna principal fixa,
 * números à direita, linha selecionada destacada, contagem e "mostrar mais" para listas grandes.
 */
export function TabelaDados<T>({ dados, colunas, chave, aoClicar, selecionada, busca = false, alturaMax, vazio, ordemInicial, limite = 300, acoesBusca, minLargura, testId, densa }: {
  dados: T[]; colunas: Coluna<T>[]; chave: (l: T) => string; aoClicar?: (l: T) => void; selecionada?: string | null; busca?: boolean;
  alturaMax?: number | string; vazio?: ReactNode; ordemInicial?: { chave: string; desc?: boolean }; limite?: number; acoesBusca?: ReactNode; minLargura?: number; testId?: string; densa?: boolean;
}) {
  const [ordem, setOrdem] = useState<{ chave: string; desc?: boolean } | null>(ordemInicial ?? null);
  const [termo, setTermo] = useState("");
  const [max, setMax] = useState(limite);
  const valorDe = (c: Coluna<T>, l: T) => (c.valor ? c.valor(l) : (l as Record<string, unknown>)[c.chave] as string | number | null | undefined);
  const linhas = useMemo(() => {
    let r = dados;
    const t = termo.trim().toLowerCase();
    if (t) r = r.filter((l) => colunas.some((c) => String(valorDe(c, l) ?? "").toLowerCase().includes(t)));
    if (ordem) {
      const c = colunas.find((x) => x.chave === ordem.chave);
      if (c) {
        r = [...r].sort((a, b) => {
          const va = valorDe(c, a), vb = valorDe(c, b);
          if (va == null || va === "") return 1;
          if (vb == null || vb === "") return -1;
          const n = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
          return ordem.desc ? -n : n;
        });
      }
    }
    return r;
  }, [dados, termo, ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  const alternar = (c: Coluna<T>) => {
    if (c.ordenavel === false) return;
    setOrdem((o) => (o?.chave !== c.chave ? { chave: c.chave } : o.desc ? null : { chave: c.chave, desc: true }));
  };
  const IconeOrdem = ({ c }: { c: Coluna<T> }) => {
    if (c.ordenavel === false) return null;
    if (ordem?.chave !== c.chave) return <IconArrowsSort size={11} style={{ opacity: 0.35, marginLeft: 3, verticalAlign: -1 }} />;
    return ordem.desc ? <IconSortDescending size={12} style={{ marginLeft: 3, verticalAlign: -2 }} /> : <IconSortAscending size={12} style={{ marginLeft: 3, verticalAlign: -2 }} />;
  };
  return (
    <div data-testid={testId}>
      {(busca || acoesBusca) && (
        <Group gap="xs" px={10} py={6} style={{ borderBottom: "1px solid var(--gm-borda-suave)" }} className="nao-imprimir">
          {busca && <TextInput w={240} placeholder="Buscar nesta tabela" leftSection={<IconSearch size={13} />} value={termo} onChange={(e) => setTermo(e.currentTarget.value)} />}
          <Text size="xs" c="dimmed">{linhas.length === dados.length ? `${dados.length} registro(s)` : `${linhas.length} de ${dados.length} registro(s)`}</Text>
          {acoesBusca && <Group gap={6} ml="auto">{acoesBusca}</Group>}
        </Group>
      )}
      {!linhas.length ? (vazio ?? <Vazio compacto titulo={termo ? "Nada encontrado com essa busca." : "Nenhum registro."} />) : (
        <div className="gm-tabela-caixa" style={{ maxHeight: alturaMax }}>
          <Table miw={minLargura} verticalSpacing={densa ? 2 : 4}>
            <Table.Thead>
              <Table.Tr>
                {colunas.map((c) => (
                  <Table.Th key={c.chave} className={`${c.numero ? "gm-num" : ""} ${c.fixa ? "gm-fixa" : ""} ${c.ordenavel === false ? "" : "gm-ordenavel"}`} w={c.largura} onClick={() => alternar(c)}>
                    {c.dica ? <Tooltip label={c.dica}><span>{c.titulo}</span></Tooltip> : c.titulo}<IconeOrdem c={c} />
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {linhas.slice(0, max).map((l) => {
                const k = chave(l);
                return (
                  <Table.Tr key={k} data-sel={selecionada === k} data-clicavel={!!aoClicar} onClick={aoClicar ? () => aoClicar(l) : undefined}>
                    {colunas.map((c) => (
                      <Table.Td key={c.chave} className={`${c.numero ? "gm-num" : ""} ${c.fixa ? "gm-fixa" : ""}`}>{c.render ? c.render(l) : valorDe(c, l)}</Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {linhas.length > max && (
            <Group justify="center" py={6}>
              <Button variant="subtle" onClick={() => setMax((x) => x + limite)}>Mostrar mais {Math.min(limite, linhas.length - max)} de {linhas.length - max} restantes</Button>
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

/** Moldura das telas de entrada (login, primeiro acesso, troca obrigatória de senha). */
export function TelaEntrada({ children, largura = 400 }: { children: ReactNode; largura?: number }) {
  return (
    <div className="gm-entrada">
      <div className="gm-entrada-marca">
        <img src="/favicon.png" alt="" width={34} height={34} />
        <div>
          <div className="gm-entrada-nome">GeoMina</div>
          <div className="gm-entrada-sub">Gestão de dados geológicos de mina subterrânea</div>
        </div>
      </div>
      <div className="gm-entrada-cartao" style={{ maxWidth: largura }}>{children}</div>
      <div className="gm-entrada-rodape">Aplicativo local: os dados ficam somente neste computador.</div>
    </div>
  );
}
