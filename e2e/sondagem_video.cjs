// Sondagem como no vídeo de referência: Início, perfil do furo (RQD, ocorrências, fotos, barras), trecho clicado, furos lado a lado,
// química comparada, amostragem geoquímica, fotos de testemunho em lote e tracks geoquímicos.
// Uso: node e2e/sondagem_video.cjs http://127.0.0.1:PORTA [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");

const [URL, CAPTURAS] = process.argv.slice(2);
let erros_global = [];
const SENHA = "senhaForte123";

// ---- dados de exemplo (determinísticos) ----
const LITOS = [["Solo", "solo argiloso vermelho, úmido"], ["Saprolito", "saprolito de gnaisse, friável"], ["Gnaisse pelítico", "gnaisse bandado com granada e pirita disseminada"],
  ["Flogopita xisto", "flogopitito com esmeralda e molibdenita, veios de quartzo"], ["Anfibólio gnaisse", "anfibólio gnaisse fino, com calcita em fraturas"],
  ["Talco xisto", "talco xisto cinza esverdeado"], ["Flogopita xisto", "flogopita xisto sem esmeralda, com berilo"], ["Gnaisse pelítico", "gnaisse pelítico, material não recuperado no fim da manobra"]];
function furoDados(cod, prof, deslocA) {
  const geo = [], am = [], lab = [];
  let d = 0, k = 0, cx = 1, cxIni = 0;
  while (d < prof) {
    const esp = k < 2 ? 3 : 2 + ((k * 7 + deslocA) % 6);
    const ate = Math.min(prof, d + esp);
    const [lit, desc] = k < 2 ? LITOS[k] : LITOS[2 + ((k + deslocA) % 6)];
    const rqd = k < 2 ? "" : String((k * 37 + deslocA * 11) % 100);
    if (d - cxIni >= 5) { cx++; cxIni = d; }
    geo.push([cod, d, ate, lit, rqd, k < 2 ? "" : cx, desc].join(";"));
    d = ate; k++;
  }
  let n = 0;
  for (let s = 12; s < prof - 4; s += 1.5) {
    const c = `BMT-TS-${cod.replace(/\D/g, "")}${String(++n).padStart(3, "0")}`;
    am.push([cod, c, String(s).replace(".", ","), String(s + 1.5).replace(".", ",")].join(";"));
    const z = Math.sin(s / 4 + deslocA) + 1.2;
    lab.push([c, "SMP", (z * 40).toFixed(1).replace(".", ","), Math.round(z * 900), Math.round(30 + z * 50), (6 + z * 5).toFixed(1).replace(".", ","),
      n % 7 === 0 ? "<2" : (z * 6).toFixed(1).replace(".", ","), Math.round(80 + z * 60), (2 + z).toFixed(2).replace(".", ","), (0.5 + z).toFixed(2).replace(".", ",")].join(";"));
  }
  return { geo, am, lab };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 960 }, deviceScaleFactor: CAPTURAS ? 2 : 1 });
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = []; erros_global = erros;
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (caminho, opcoes = {}) => page.evaluate(async ([c, o]) => {
    const h = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    let body;
    if (o.form) { body = new FormData(); for (const [k, v] of Object.entries(o.form)) body.append(k, v); for (const [k, nome, txt] of o.arquivos ?? []) body.append(k, new Blob([txt], { type: "text/csv" }), nome); }
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

  const F = [["F310", 60, 0, "baixada, curva do rio"], ["F311", 52, 3, "encosta norte"], ["F312", 48, 5, "baixada, curva do rio"]];
  const geo = ["furo;de;ate;litologia;rqd;caixa;descricao"], am = ["furo;amostra;de;ate"], lab = ["Amostra;Tipo;Be (ppm);Cr (ppm);Li (ppm);MgO (%);Mo (ppm);V (ppm);Fe2O3 (%);K2O (%)"];
  const collar = ["furo;x;y;z;azimute;inclinacao;profundidade;area"];
  for (const [c, p, d, area] of F) { const x = furoDados(c, p, d); geo.push(...x.geo); am.push(...x.am); lab.push(...x.lab); collar.push([c, 500000 + d * 40, 7800000, 600 - d, 0, -90, p, area].join(";")); }
  geo.push("INA07;0;3;Solo;;;solo úmido, água a 2 m", "INA07;3;9;Saprolito;;1;saprolito encharcado", "INA07;9;15;Gnaisse pelítico;70;2;gnaisse com carbonato");
  collar.push("INA07;500300;7800050;612;0;-90;15;poço de monitoramento");
  const sp = await chamar(`/minas/${mina.id}/sondagem/importacoes`, { form: { srid: "31983" }, arquivos: [["collar", "collar.csv", collar.join("\n")], ["geologia", "geo.csv", geo.join("\n")], ["amostras", "am.csv", am.join("\n")]] });
  assert.deepStrictEqual(sp.erros, [], JSON.stringify(sp.erros));
  await chamar(`/importacoes/${sp.id}/confirmar-sondagem`, { json: {} });
  const lp = await chamar(`/minas/${mina.id}/laudos`, { form: {}, arquivos: [["arquivo", "laudo.csv", lab.join("\n")]] });
  await chamar(`/importacoes/${lp.id}/confirmar-laudo`, { json: { certificado: "GQ2611017" } });

  // 1. Início: cartão da Sondagem
  await page.reload();
  await page.getByText("Sondagem: furos de sonda").waitFor();
  await page.getByText("Exploratórios (F)").waitFor();
  await shot("v01-inicio-sondagem");

  // 2. Perfil do furo
  await page.getByRole("link", { name: "Perfil do furo" }).click();
  await page.waitForTimeout(1500); await shot("dbg"); await page.getByRole("tab", { name: "Tracks geoquímicos" }).waitFor();
  await page.getByText(/RQD F31\d/).first().waitFor();
  await page.getByText("Elementos no perfil").waitFor();
  await page.locator("svg text", { hasText: "Testemunho" }).first().waitFor();
  await page.getByRole("textbox", { name: "Ponto / furo" }).click();
  await page.getByRole("option", { name: /^F310/ }).click();
  await page.getByRole("button", { name: "Todos" }).click();
  await page.waitForTimeout(400);
  await shot("v02-perfil-do-furo");

  // 3. Clique num trecho com esmeralda → painel; tira e devolve a marca
  await page.locator("svg g title", { hasText: "Flogopita xisto" }).first().locator("..").click();
  await page.getByText("Trecho do furo").waitFor();
  await page.getByText("Cota topo / base").waitFor();
  await page.waitForTimeout(600);
  await shot("v03-trecho-clicado");
  const btn = page.getByRole("button", { name: /marca de esmeralda|Marcar esmeralda/ });
  const tinha = (await btn.textContent()).includes("Tirar");
  await btn.click();
  await page.getByRole("button", { name: "Voltar a seguir a descrição" }).waitFor();
  await page.getByRole("button", { name: tinha ? "Marcar esmeralda" : "Tirar marca de esmeralda" }).waitFor();
  await page.getByRole("button", { name: "Voltar a seguir a descrição" }).click();
  await page.getByRole("button", { name: "Voltar a seguir a descrição" }).waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Padrão" }).click();

  // 4. Furo inteiro, colunas e INA
  await page.getByText("Inteiro", { exact: true }).click();
  await page.getByRole("button", { name: "Colunas" }).click();
  await page.getByRole("menuitem", { name: "Cota" }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await shot("v04-furo-inteiro");

  // 5. Furos lado a lado + química comparada
  await page.getByRole("textbox", { name: "Comparar com" }).click();
  await page.getByRole("option", { name: /^F311/ }).click();
  await page.getByRole("option", { name: /^F312/ }).click();
  await page.keyboard.press("Escape");
  await page.getByText("Amostrado", { exact: true }).click();
  await page.locator("svg text", { hasText: "F312" }).first().waitFor();
  await page.getByRole("button", { name: "Mover para a direita" }).first().click();
  await page.waitForTimeout(300);
  await shot("v05-furos-lado-a-lado");
  await page.getByRole("button", { name: "Análise geoquímica deste perfil" }).click();
  await page.getByText("Química comparada").waitFor();
  await page.getByText("m desde o topo amostrado").first().waitFor();
  await page.getByText("Química comparada").scrollIntoViewIfNeeded();
  await shot("v06-quimica-por-nivel");
  await page.getByText("Por litologia", { exact: true }).click();
  await page.getByRole("columnheader", { name: /mediana \(mín–máx\)/ }).first().waitFor();
  await page.getByText("Química comparada").scrollIntoViewIfNeeded();
  await shot("v07-quimica-por-litologia");

  // 6. Amostragem geoquímica
  await page.getByRole("tab", { name: "Amostragem geoquímica" }).click();
  await page.getByText("Total de amostras").waitFor();
  await page.getByText("baixada, curva do rio").first().waitFor();
  await page.getByRole("cell", { name: "BMT-TS-310003", exact: true }).click();
  await page.getByText("Química completa").waitFor();
  await shot("v08-amostragem");
  await page.getByText("Maiores (%)").click();
  await page.getByText("3 elementos").waitFor();
  await page.getByRole("button", { name: "Fotos", exact: true }).click();

  // 7. Fotos de testemunho: importação em lote pelo nome
  await page.getByRole("button", { name: "Importar fotos" }).waitFor();
  const fotos = await page.evaluate(() => {
    const r = [];
    const nomes = ["F310_CX1_6-11.png", "F310_CX2_11-16.png", "F310_CX3.png", "F310_CX4_21-26.png", "F310_CX5_26-31.png", "F311_CX2_10-15.png", "F999_CX1_1-2.png"];
    nomes.forEach((nome, k) => {
      const cv = document.createElement("canvas"); cv.width = 480; cv.height = 160; const x = cv.getContext("2d");
      x.fillStyle = "#5b4a3a"; x.fillRect(0, 0, 480, 160);
      for (let i = 0; i < 5; i++) { x.fillStyle = ["#9c8b74", "#6f8f6a", "#b5a58a", "#4f6d4a", "#a89880"][(i + k) % 5]; x.fillRect(10, 8 + i * 30, 460, 22); }
      x.fillStyle = "#fff"; x.font = "14px sans-serif"; x.fillText(nome, 14, 155);
      r.push([nome, cv.toDataURL("image/png").split(",")[1]]);
    });
    return r;
  });
  await page.getByRole("button", { name: "Importar fotos" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Escolher fotos…" }).click()]);
  await chooser.setFiles(fotos.map(([name, b64]) => ({ name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") })));
  await page.getByText("furo não encontrado").waitFor();
  await shot("v09-importar-fotos");
  await page.getByRole("button", { name: "Gravar 6 foto(s)" }).click();
  await page.getByText("6 foto(s) gravada(s).").waitFor();
  await page.getByText("Caixas do log sem foto:").waitFor();
  await page.locator("img").first().waitFor();
  await page.waitForTimeout(500);
  await shot("v10-fotos-por-caixa");
  await page.getByText("Ao longo do furo", { exact: true }).click();
  await page.waitForTimeout(500);
  await shot("v11-fotos-ao-longo");
  await page.locator("img").first().click();
  await page.getByRole("link", { name: "Baixar original" }).waitFor();
  await page.getByRole("button", { name: "⟳ Girar" }).click();
  await page.waitForTimeout(500);
  await shot("v12-visor-foto");
  await page.keyboard.press("Escape");
  await page.getByText("Tabela", { exact: true }).click();
  await page.getByRole("cell", { name: /F310 6–11 m/ }).waitFor();

  // 8. Tracks geoquímicos
  await page.getByRole("tab", { name: "Tracks geoquímicos" }).click();
  await page.getByText("Abaixo do limite de detecção").first().waitFor();
  await page.locator("svg text", { hasText: "Registros" }).waitFor();
  await page.getByRole("textbox", { name: "Abaixo do limite de detecção" }).click();
  await page.getByRole("option", { name: "Usar metade do LD" }).click();
  await page.getByText("Log", { exact: true }).first().click();
  await page.waitForTimeout(400);
  await shot("v13-tracks");

  // 9. Perfil com fotos no furo e filtro INA
  await page.getByRole("tab", { name: "Perfil do furo" }).click();
  await page.locator("svg image").first().waitFor();
  await page.getByText(/^INA \(água\)/).click();
  await page.getByText("furo INA (água)").waitFor();
  await page.waitForTimeout(400);
  await shot("v14-ina");

  assert.deepStrictEqual(erros, []);
  console.log("OK — sondagem como no vídeo");
  await browser.close();
})().catch((e) => { console.error(e.message.slice(0, 300)); console.error("ERROS DA PÁGINA:", erros_global); process.exit(1); });
