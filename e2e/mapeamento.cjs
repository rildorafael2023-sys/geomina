// Teste ponta a ponta da Etapa 5: ficha digital preenchida por um geólogo e aprovada por um revisor.
// Uso: node e2e/mapeamento.cjs http://127.0.0.1:PORTA [pasta_capturas]   (pasta de dados vazia)
const { chromium } = require("playwright");
const assert = require("assert");

const URL = process.argv[2];
const CAPTURAS = process.argv[3];
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  globalThis.__pagina = page;
  const shot = async (nome, pagina = true) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${nome}.png`, fullPage: pagina });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo, token) =>
    page.evaluate(async ([metodo, caminho, corpo, token]) => {
      const r = await fetch("/api/v1" + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token ?? localStorage.getItem("geomina.token")) } });
      return { status: r.status, corpo: await r.json().catch(() => null) };
    }, [metodo, caminho, corpo, token]);
  const entrar = async (login, senha) => {
    if (await page.getByRole("button", { name: "Menu do usuário" }).count()) { await page.getByRole("button", { name: "Menu do usuário" }).click(); await page.getByRole("menuitem", { name: "Sair" }).click(); }
    await page.getByLabel("Login").fill(login);
    await page.getByLabel("Senha").fill(senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: "Menu do usuário" }).waitFor();
  };
  const escolher = async (campo, opcao) => {
    await campo.click();
    await page.getByRole("option", { name: opcao, exact: true }).click();
  };

  // preparação: administrador, mina, local, geólogo e revisor (senhas já definidas)
  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  const mina = (await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983, declinacao_magnetica: -22.5 })).corpo;
  const n144 = (await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N144", nome: "N144" })).corpo;
  await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "TRAVESSA", codigo: "TR-1FSA", nome: "Travessa 1FSA", pai_id: n144.id });
  for (const [login, nome, papel] of [["geo", "Geóloga Ana", "GEOLOGO"], ["rev", "Revisor Rui", "REVISOR"]]) {
    await chamar("POST", "/usuarios", { login, nome, senha: "provisoria1", papeis: [papel] });
    const t = (await chamar("POST", "/auth/login", { login, senha: "provisoria1" })).corpo.token;
    await chamar("POST", "/auth/senha", { senha_atual: "provisoria1", nova_senha: SENHA }, t);
  }

  // 1. Geóloga cria a ficha pela interface
  await entrar("geo", SENHA);
  await page.getByRole("navigation").getByRole("link", { name: "Mapeamento geológico" }).click();
  await page.getByRole("link", { name: "Nova ficha" }).click();
  await escolher(page.getByRole("textbox", { name: /^Local/ }), "TR-1FSA — Travessa 1FSA (Travessa)");
  await escolher(page.getByRole("textbox", { name: "Exposição mapeada" }), "Frente");
  await page.getByLabel("Distância (m)").fill("26");
  await page.getByLabel("Medida a partir de").fill("entrada da travessa");
  await page.getByLabel("Altura da seção (m)").fill("3,2");
  // intervalos
  await page.getByLabel("Até (m)").first().fill("1,4");
  await escolher(page.getByRole("textbox", { name: /^Litologia/ }).nth(0), "Anfibólio gnaisse (Ang)");
  await page.getByRole("button", { name: "+ Intervalo" }).click();
  assert.strictEqual(await page.getByLabel("2. De (m)").inputValue(), "1,4", "novo intervalo deve começar onde o anterior termina");
  await page.getByLabel("Até (m)").nth(1).fill("1,8");
  await escolher(page.getByRole("textbox", { name: /^Litologia/ }).nth(1), "Flogopita xisto (Flx)");
  await escolher(page.getByRole("textbox", { name: "Alteração" }).nth(1), "Flogopitização");
  await escolher(page.getByRole("textbox", { name: "Intensidade" }).nth(1), "Forte");
  await page.getByRole("button", { name: "+ Intervalo" }).click();
  await page.getByLabel("Até (m)").nth(2).fill("3,2");
  await escolher(page.getByRole("textbox", { name: /^Litologia/ }).nth(2), "Gnaisse pelítico (Gnp)");
  // medidas: S1 230/30 e lineação 315/20
  await page.getByRole("button", { name: "+ Medida" }).click();
  await escolher(page.getByRole("textbox", { name: "1. Estrutura" }), "S1 (foliação) (S1)");
  await page.getByLabel("Dir. merg. (°)").fill("230");
  await page.getByLabel("Mergulho (°)").fill("30");
  await page.getByRole("button", { name: "+ Medida" }).click();
  await escolher(page.getByRole("textbox", { name: "2. Estrutura" }), "Lineação mineral (Lm)");
  await page.getByLabel("Caimento (°)").fill("20");
  await page.getByLabel("Rumo (°)").fill("315");
  // amostras: grafia de campo normalizada; "RP 478" exige confirmação
  await page.getByRole("button", { name: "+ Amostra" }).click();
  await page.getByLabel("1. Código").fill("BS - RP - 474 - A");
  await page.getByLabel("1. Código").blur();
  await page.waitForFunction(() => document.querySelector('input[value="BS-RP-474A"]'));
  await page.getByRole("button", { name: "+ Amostra" }).click();
  await page.getByLabel("2. Código").fill("RP 478");
  await page.getByLabel("2. Código").blur();
  await page.getByRole("button", { name: "Usar BS-RP-478" }).click();
  await page.getByLabel("Descrição / interpretação").fill("Minério associado a anfibólio gnaisse alterado e milonitizado.");
  // pré-visualizações
  assert.strictEqual(await page.locator('svg[aria-label="Coluna da seção mapeada"] rect').count(), 3);
  assert.strictEqual(await page.locator('svg[aria-label^="Estereograma"] polyline').count(), 1);
  assert.strictEqual(await page.locator('svg[aria-label^="Estereograma"] polygon').count(), 1);
  await page.getByRole("button", { name: "Criar ficha (rascunho)" }).click();
  await page.getByRole("heading", { name: /Ficha MAP-\d{4}-0001/ }).waitFor();
  await page.getByText("Rascunho", { exact: true }).first().waitFor();
  await shot("e5-01-ficha-rascunho");

  // 2. Submeter: ficha fica bloqueada
  await page.getByRole("button", { name: "Submeter para revisão" }).click();
  await page.getByText("Aguardando revisão", { exact: true }).first().waitFor();
  assert.strictEqual(await page.getByRole("button", { name: "Salvar alterações" }).count(), 0);
  assert.strictEqual(await page.getByRole("button", { name: "Aprovar" }).count(), 0, "geóloga não aprova");
  const fichaUrl = page.url();

  // 3. Revisor aprova
  await entrar("rev", SENHA);
  await page.goto(fichaUrl);
  await page.getByRole("button", { name: "Aprovar" }).click();
  await page.getByText("Aprovada", { exact: true }).first().waitFor();
  await page.getByText(/revisada por Revisor Rui/).waitFor();

  // 4. Impressão e ficha em branco
  await page.getByRole("link", { name: "Imprimir / PDF" }).click();
  await page.getByText(/FICHA DE MAPEAMENTO GEOLÓGICO/).waitFor();
  await page.getByRole("cell", { name: "BS-RP-474A" }).waitFor();
  await page.getByRole("cell", { name: "230/30" }).waitFor();
  await shot("e5-02-impressao");
  await page.goto(URL + "mapeamento/ficha-em-branco");
  await page.getByText("Geólogo: ______").waitFor();
  await shot("e5-03-ficha-em-branco");

  // 5. Lista com filtro por litologia e aba Mapeamentos da unidade
  await page.goto(URL + "mapeamento");
  await page.getByRole("cell", { name: "Ang, Flx, Gnp" }).waitFor();
  await page.goto(URL + "estrutura");
  await page.getByRole("tree").getByText("TR-1FSA").first().click();
  await page.getByRole("tab", { name: "Mapeamentos" }).click();
  await page.getByRole("cell", { name: /MAP-\d{4}-0001/ }).waitFor();

  // 6. Dicionários
  await page.getByRole("navigation").getByRole("link", { name: "Dicionários" }).click();
  await page.getByRole("cell", { name: /Gnaisse pelítico/ }).waitFor();
  await page.getByRole("cell", { name: "Lente cloritito; Lente de cloritito" }).waitFor();

  // 7. Painel e celular
  await page.goto(fichaUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("A. Identificação").waitFor();
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(extra <= 0, `rolagem horizontal de ${extra}px no celular`);
  await shot("e5-04-celular", false);

  assert.deepStrictEqual(erros, [], "erros no console da página");
  await browser.close();
  console.log("E2E MAPEAMENTO OK: 7 cenários aprovados");
})().catch(async (e) => {
  console.error("E2E MAPEAMENTO FALHOU:", e);
  if (CAPTURAS && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: `${CAPTURAS}/falha.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
