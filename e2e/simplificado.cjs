// Teste ponta a ponta da versão simplificada: menu enxuto, local criado na ficha, perfil da frente com teores e log de sondagem.
// Uso: node e2e/simplificado.cjs http://127.0.0.1:PORTA [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: CAPTURAS ? 2 : 1 });
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const escolher = async (campo, opcao) => { await campo.click(); await page.getByRole("option", { name: opcao, exact: true }).click(); };
  const chamar = (caminho, opcoes = {}) => page.evaluate(async ([c, o]) => {
    const h = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    let body = o.body;
    if (o.form) { body = new FormData(); for (const [k, v] of Object.entries(o.form)) body.append(k, v); for (const [k, nome, txt, tipo] of o.arquivos ?? []) body.append(k, new Blob([txt], { type: tipo ?? "text/csv" }), nome); }
    else if (o.json) { h["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
    const r = await fetch("/api/v1" + c, { method: o.method ?? (body ? "POST" : "GET"), headers: h, body });
    return r.status === 204 ? null : r.json();
  }, [caminho, opcoes]);

  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  const mina = await chamar("/minas", { json: { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 } });

  // 1. Menu: sem Geoquímica operacional, com Sondagem
  await page.reload();
  const nav = page.getByRole("navigation");
  await nav.getByRole("link", { name: "Sondagem" }).waitFor();
  assert.strictEqual(await nav.getByText("Geoquímica operacional").count(), 0);
  for (const item of ["Estrutura da mina", "Mapeamento geológico", "Amostras", "Laboratório (laudos)", "Topografia", "Relatórios", "Fotos e croquis", "Dicionários"])
    await nav.getByRole("link", { name: item }).waitFor();

  // 2. Nova ficha: cadastra o nível N144 e a Travessa 1F5 dentro dele, sem sair da ficha
  await nav.getByRole("link", { name: "Mapeamento geológico" }).click();
  await page.getByRole("link", { name: "Nova ficha" }).click();
  await page.getByRole("button", { name: "Novo local" }).click();
  let dlg = page.getByRole("dialog", { name: "Novo local na mina" });
  await escolher(dlg.getByRole("textbox", { name: "Tipo" }), "Nível");
  await dlg.getByLabel("Código").fill("N144");
  await dlg.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByText("Local N144 cadastrado.").waitFor();
  await page.getByRole("button", { name: "Novo local" }).click();
  dlg = page.getByRole("dialog", { name: "Novo local na mina" });
  await dlg.getByLabel("Código").fill("1F5");
  await dlg.getByLabel("Nome").fill("Travessa 1F5");
  await escolher(dlg.getByRole("textbox", { name: "Fica em (região)" }), "N144 (Nível)");
  await shot("s1-novo-local");
  await dlg.getByRole("button", { name: "Cadastrar" }).click();
  await page.getByText("Local 1F5 cadastrado.").waitFor();
  assert.strictEqual(await page.getByRole("textbox", { name: /^Local/ }).inputValue(), "1F5 — Travessa 1F5 (Travessa)");
  await page.getByLabel("Até (m)").first().fill("2");
  await escolher(page.getByRole("textbox", { name: /^Litologia/ }).nth(0), "Gnaisse pelítico (Gnp)");
  await page.getByRole("button", { name: "Criar ficha (rascunho)" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).waitFor();
  await shot("s2-ficha-criada");
  const travessa = (await chamar(`/minas/${mina.id}/unidades`)).find((u) => u.codigo === "1F5");

  // 3. Amostras: planilha de campo (mesma amostra em 2 trechos + trecho sem amostra) e laudo
  const campo = "Ponto;Direção da seção;Intervalo;Litologia;Descrição de campo;Data;Amostra\n" +
    "P-225;Travessa 1F5;0 m - 1 m;Gnaisse pelítico;gnaisse bandado;15/10/2026;BS-RP-225\n" +
    ";Travessa 1F5;1 m - 2 m;Flogopita xisto;xisto com flogopita;15/10/2026;BS-RP-225\n" +
    ";Travessa 1F5;2 m - 3 m;Anfibólio gnaisse;não amostrado;;\n" +
    ";Travessa 1F5;3 m - 4,5 m;Gnaisse pelítico;lapa;15/10/2026;BS-RP-226\n";
  const p = await chamar(`/minas/${mina.id}/amostras/importacoes`, { form: {}, arquivos: [["arquivo", "campo.csv", campo]] });
  const c = await chamar(`/importacoes/${p.id}/confirmar-amostras`, { json: {} });
  assert.strictEqual(c.trechos_perfil, 4);
  await chamar(`/minas/${mina.id}/amostras/ligar-unidade`, { json: { unidade_id: travessa.id, local: "Travessa 1F5" } });
  const laudo = "Amostra;Tipo;Au (ppm);Cr (ppm);Be (ppm);Li (ppm);MgO (%);Fe2O3 (%);SiO2 (%)\n" +
    "BS-RP-225;SMP;0,12;519;4,2;35;12,5;8,1;52,3\nBS-RP-226;SMP;<0,01;<10;68,1;210;3;4,4;66,1\n";
  const lp = await chamar(`/minas/${mina.id}/laudos`, { form: {}, arquivos: [["arquivo", "laudo.csv", laudo]] });
  await chamar(`/importacoes/${lp.id}/confirmar-laudo`, { json: { certificado: "GQ2613496" } });

  await nav.getByRole("link", { name: "Amostras" }).click();
  await page.getByRole("cell", { name: "BS-RP-225" }).click();
  await page.getByText("Perfil da frente — BS-RP-225").first().waitFor();
  const tabela = page.getByTestId("tabela-perfil");
  await tabela.getByText("Flogopita xisto").waitFor();
  await tabela.getByText("não amostrado").first().waitFor();
  await tabela.getByRole("cell", { name: "519", exact: true }).waitFor();
  await tabela.getByRole("cell", { name: "<10", exact: true }).waitFor();
  assert.strictEqual(await tabela.locator("tbody tr").count(), 4);
  await shot("s3-perfil-frente");
  await page.getByRole("button", { name: "Editar perfil" }).click();
  await page.getByRole("button", { name: "+ Trecho" }).click();
  await shot("s4-editar-perfil");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.keyboard.press("Escape");

  // 4. Sondagem: furo, descrição, amostras, laudo e foto do testemunho → log
  const furo = await chamar(`/minas/${mina.id}/furos`, { json: { codigo: "FD-001", x: 500000, y: 7800000, z: 600, srid: 31983, azimute: 45, inclinacao: -60, profundidade_final: 40, projeto: "Lavra", responsavel: "Rildo", metodo: "Diamantada HQ" } });
  const geo = "furo;de;ate;litologia;alteracao;descricao\nFD-001;0;6;Gnaisse pelítico;;gnaisse bandado com granada\nFD-001;6;14;Flogopita xisto;Flogopitização;xisto com flogopita e veios de quartzo\nFD-001;14;25;Anfibólio gnaisse;;anfibólio gnaisse fino\nFD-001;25;40;Gnaisse pelítico;;gnaisse com sulfetos disseminados\n";
  const am = "furo;amostra;de;ate\nFD-001;BMT-TS-501;6;7,5\nFD-001;BMT-TS-502;7,5;9\nFD-001;BMT-TS-503;9;10,5\nFD-001;BMT-TS-504;25;26\n";
  const sp = await chamar(`/minas/${mina.id}/sondagem/importacoes`, { form: { srid: "31983" }, arquivos: [["geologia", "geo.csv", geo], ["amostras", "am.csv", am]] });
  assert.deepStrictEqual(sp.erros, []);
  await chamar(`/importacoes/${sp.id}/confirmar-sondagem`, { json: {} });
  const laudo2 = "Amostra;Tipo;Au (ppm);Cr (ppm);Be (ppm);MgO (%)\nBMT-TS-501;SMP;0,05;800;12;14\nBMT-TS-502;SMP;0,31;1508;40;18\nBMT-TS-503;SMP;0,02;320;6;9\nBMT-TS-504;SMP;<0,01;<10;2;2\n";
  const lp2 = await chamar(`/minas/${mina.id}/laudos`, { form: {}, arquivos: [["arquivo", "laudo2.csv", laudo2]] });
  await chamar(`/importacoes/${lp2.id}/confirmar-laudo`, { json: { certificado: "GQ2604840" } });
  const png = await page.evaluate(async () => { const cv = document.createElement("canvas"); cv.width = 400; cv.height = 120; const x = cv.getContext("2d"); x.fillStyle = "#8a7560"; x.fillRect(0, 0, 400, 120); x.fillStyle = "#c9b79c"; for (let i = 0; i < 5; i++) x.fillRect(10, 10 + i * 22, 380, 14); return cv.toDataURL("image/png"); });
  await page.evaluate(async ([id, url]) => {
    const b = await (await fetch(url)).blob(); const fd = new FormData(); fd.append("arquivos", b, "caixa1.png"); fd.append("de_m", "0"); fd.append("ate_m", "10"); fd.append("caixa", "1"); fd.append("legenda", "Caixa 1, 0–10 m");
    await fetch(`/api/v1/furos/${id}/fotos`, { method: "POST", headers: { Authorization: "Bearer " + localStorage.getItem("geomina.token") }, body: fd });
  }, [furo.id, png]);

  await nav.getByRole("link", { name: "Sondagem" }).click();
  await page.getByRole("cell", { name: "FD-001" }).click();
  await page.getByText("Log de sondagem — FD-001").waitFor();
  await page.getByTestId("tabela-teores").getByRole("cell", { name: "1508", exact: true }).waitFor();
  await page.getByTestId("tabela-descricao").getByText("xisto com flogopita e veios de quartzo").waitFor();
  await page.getByTestId("fotos-furo").locator("img").waitFor();
  await shot("s5-log-furo");
  await page.getByRole("button", { name: "Editar descrição" }).click();
  await page.getByRole("button", { name: "+ Intervalo" }).waitFor();
  await page.keyboard.press("Escape");

  // 5. A rota antiga da geoquímica operacional volta ao painel
  await page.goto(URL + "geoop");
  await page.getByText("Olá, Administrador").waitFor();

  assert.deepStrictEqual(erros, []);
  console.log("OK — versão simplificada: menu, local na ficha, perfil da frente e log de sondagem");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
