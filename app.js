const C = window.CONFIG;
const DEMO = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
const $ = s => document.querySelector(s);
const ROT = { kg: ["kg", "kg"], g: ["g", "g"], un: ["unidade", "unidades"], pote: ["pote", "potes"], pacote: ["pacote", "pacotes"], litro: ["litro", "litros"] };
const rot = (u, q = 2) => (ROT[u] ? ROT[u][q === 1 ? 0 : 1] : u);
const U = (u, p) => [{ unidade: u, preco: p }];
const DEMO_PRODUTOS = [
  { id: 1, nome: "Paleta", unidades: U("kg", 20) },
  { id: 2, nome: "Costela", unidades: U("kg", 23) },
  { id: 3, nome: "Linguiça fina", unidades: [{ unidade: "kg", preco: 20 }, { unidade: "pacote", preco: 20 }] },
  { id: 4, nome: "Torresmo", unidades: U("pacote", 12) },
  { id: 5, nome: "Banha", unidades: U("litro", 25) }
];
const brl = n => n.toFixed(2).replace(".", ",");
const fq = q => String(q).replace(".", ",");
const esc = t => { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; };
const passo = u => (u === "kg" ? 0.5 : 1);
const preco = (p, u) => Number(p.unidades.find(x => x.unidade === u).preco);
let produtos = [], cart = {}, dia = null, pedido = null;

async function rpc(fn, args) {
  const r = await fetch(`${C.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY }, body: JSON.stringify(args || {})
  });
  if (!r.ok) { let m = "Não foi possível concluir. Tente de novo."; try { m = (await r.json()).message || m; } catch (e) {} throw new Error(m); }
  return r.json();
}
function ir(n) { [1, 2, 3, 4].forEach(i => ($("#p" + i).hidden = i !== n)); window.scrollTo(0, 0); }
function erro(id, msg) { const e = $(id); e.textContent = msg || ""; e.hidden = !msg; }

function cardHTML(p) {
  const c = cart[p.id];
  let h = `<article class="prod${c ? " on" : ""}" data-id="${p.id}"><div class="topo"><h3>${esc(p.nome)}</h3>`;
  if (p.unidades.length === 1) h += `<span class="preco">R$ ${brl(Number(p.unidades[0].preco))} o ${rot(p.unidades[0].unidade, 1)}</span>`;
  h += "</div>";
  if (!c) return h + `<button class="add" data-add="1">Quero este</button></article>`;
  if (p.unidades.length > 1) h += `<div class="chips" role="group" aria-label="Como você quer comprar">` + p.unidades.map(x => `<button class="chip${x.unidade === c.u ? " sel" : ""}" data-un="${x.unidade}">Por ${rot(x.unidade, 1)}<br>R$ ${brl(Number(x.preco))}</button>`).join("") + "</div>";
  return h + `<div class="qtd"><button data-m="1" aria-label="Diminuir ${esc(p.nome)}">−</button><output aria-live="polite">${fq(c.q)} ${rot(c.u, c.q)}</output><button data-p="1" aria-label="Aumentar ${esc(p.nome)}">+</button></div></article>`;
}
function total() { return produtos.reduce((s, p) => s + (cart[p.id] ? cart[p.id].q * preco(p, cart[p.id].u) : 0), 0); }
function barra() {
  const n = Object.keys(cart).length;
  $("#tot").textContent = n ? `Total estimado: R$ ${brl(total())}` : "Escolha os produtos";
  $("#cont1").disabled = !n;
}
$("#lista").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const card = b.closest("article"), p = produtos.find(x => x.id == card.dataset.id), c = cart[p.id];
  if (b.dataset.add) cart[p.id] = { u: p.unidades[0].unidade, q: passo(p.unidades[0].unidade) };
  else if (b.dataset.un) cart[p.id] = { u: b.dataset.un, q: passo(b.dataset.un) };
  else if (b.dataset.p) c.q = Math.min(99, c.q + passo(c.u));
  else if (b.dataset.m) { c.q -= passo(c.u); if (c.q <= 0) delete cart[p.id]; }
  card.outerHTML = cardHTML(p); barra();
};
$("#cont1").onclick = () => ir(2);

// Datas das próximas feiras (fuso de São Paulo)
function feiras() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const g = {}; f.formatToParts(new Date()).forEach(x => (g[x.type] = x.value));
  const y = +g.year, m = +g.month, d = +g.day, dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let off = (C.FEIRA_DIA - dow + 7) % 7;
  if (off === 0 && +g.hour >= C.FEIRA_FIM_HORA) off = 7;
  return [0, 1, 2].map(k => {
    const dt = new Date(Date.UTC(y, m - 1, d + off + 7 * k));
    const dd = String(dt.getUTCDate()).padStart(2, "0"), mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const nome = k === 0 ? (off === 0 ? "Hoje" : off >= 7 ? "Sábado que vem" : "Este sábado") : "Sábado";
    return { iso: dt.toISOString().slice(0, 10), txt: `${nome}, ${dd}/${mm}` };
  });
}
function desenhaDias() {
  $("#dias").innerHTML = feiras().map((x, i) => { if (i === 0 && !dia) dia = x.iso; return `<button class="dia${x.iso === dia ? " sel" : ""}" data-d="${x.iso}" data-t="${x.txt}">${x.txt}</button>`; }).join("");
}
$("#dias").onclick = e => { const b = e.target.closest("button"); if (!b) return; dia = b.dataset.d; document.querySelectorAll(".dia").forEach(x => x.classList.toggle("sel", x === b)); };

document.querySelectorAll(".volta").forEach(b => (b.onclick = () => ir(+b.dataset.volta)));
$("#cont2").onclick = () => {
  if ($("#site").value) return;
  const nome = $("#nome").value.trim(), tel = $("#tel").value.replace(/\D/g, "");
  if (nome.length < 2) return erro("#erro2", "Digite o seu nome para continuar.");
  if (C.TELEFONE_OBRIGATORIO && !tel) return erro("#erro2", "Informe um telefone.");
  if (tel && (tel.length < 10 || tel.length > 13)) return erro("#erro2", "Telefone incompleto. Digite com o DDD, ou deixe em branco.");
  erro("#erro2");
  const itens = produtos.filter(p => cart[p.id]).map(p => ({ produto_id: p.id, quantidade: cart[p.id].q, unidade: cart[p.id].u, nome: p.nome, valor: cart[p.id].q * preco(p, cart[p.id].u) }));
  if (!itens.length) return ir(1);
  const diaTxt = (document.querySelector(".dia.sel") || {}).dataset ? document.querySelector(".dia.sel").dataset.t : "";
  pedido = { nome, tel, dia, diaTxt, obs: $("#obs").value.trim(), itens };
  $("#resumo").innerHTML = `<p><strong>${esc(nome)}</strong>${tel ? "<br>" + esc($("#tel").value) : ""}<br>Retirada: ${esc(diaTxt)}</p>` + lista(itens) + (pedido.obs ? `<p>Recado: ${esc(pedido.obs)}</p>` : "");
  ir(3);
};
function lista(itens) {
  return "<ul>" + itens.map(i => `<li><strong>${esc(i.nome)}</strong>: ${fq(i.quantidade)} ${rot(i.unidade, i.quantidade)} (R$ ${brl(i.valor)})</li>`).join("") + `</ul><p><strong>Total estimado: R$ ${brl(itens.reduce((s, i) => s + i.valor, 0))}</strong><br><small>Valor final confirmado na barraca.</small></p>`;
}
$("#confirmar").onclick = async function () {
  this.disabled = true; erro("#erro3");
  try {
    let numero = "DEMO";
    if (!DEMO) {
      const r = await rpc("criar_encomenda", { p_nome: pedido.nome, p_telefone: pedido.tel || null, p_retirada: pedido.dia || null, p_obs: pedido.obs || null, p_itens: pedido.itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade, unidade: i.unidade })) });
      numero = r.numero;
    }
    $("#numero").textContent = numero; $("#resumo2").innerHTML = lista(pedido.itens); ir(4);
  } catch (x) { erro("#erro3", x.message); }
  this.disabled = false;
};
$("#nova").onclick = () => { cart = {}; dia = null; $("#nome").value = $("#tel").value = $("#obs").value = ""; $("#lista").innerHTML = produtos.map(cardHTML).join(""); desenhaDias(); barra(); ir(1); };

(async function init() {
  $("#titulo").textContent = C.NOME_BARRACA || "Encomendas";
  try { produtos = DEMO ? DEMO_PRODUTOS : await rpc("listar_produtos"); }
  catch (x) { return erro("#erro1", "Não foi possível carregar os produtos. Recarregue a página."); }
  $("#demo").hidden = !DEMO;
  if (!produtos.length) return erro("#erro1", "Nenhum produto disponível no momento.");
  $("#lista").innerHTML = produtos.map(cardHTML).join(""); desenhaDias(); barra();
})();
