// 膏方提成计算 - 应用逻辑
// 提成 = (总售价 - 成本 - 运费 - 额外支出) × 提成比例%
// 成本 = Σ(单位成本 × 出库数)
// 数据按月独立保存；品种随月管理；支持 xlsx 导出/导入备份。

const STORE_KEY = "gaofang_state_v2";
const $ = (id) => document.getElementById(id);
const money = (n) => "¥" + (Math.round(n * 100) / 100);

// ---------- 状态 ----------
function defaultState() {
  const m = todayMonthLabel();
  return {
    currentMonth: m,
    months: { [m]: newMonthData() },
  };
}
function newMonthData() {
  return { products: [], freight: "", extra: "", rate: "30", notes: "" };
}
function todayMonthLabel() {
  const d = new Date();
  return d.getFullYear() + "." + (d.getMonth() + 1);
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.months) return s;
    }
  } catch (e) {}
  return defaultState();
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}
function curMonth() {
  return state.months[state.currentMonth];
}

// ---------- 月份管理 ----------
function monthSortKey(label) {
  const m = String(label).match(/^(\d{4})\.(\d{1,2})$/);
  return m ? [+m[1], +m[2]] : [9999, 9999];
}
function sortedMonths() {
  return Object.keys(state.months).sort((a, b) => {
    const ka = monthSortKey(a), kb = monthSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
}
function openMonthPicker() {
  const list = $("monthList");
  list.innerHTML = "";
  const months = sortedMonths();
  months.forEach((m) => {
    const item = document.createElement("div");
    item.className = "month-item" + (m === state.currentMonth ? " active" : "");
    item.innerHTML = "<span>" + escapeHtml(m) + "</span><span class=\"check\"></span>";
    item.addEventListener("click", () => {
      switchMonth(m);
      closeMonthPicker();
    });
    list.appendChild(item);
  });
  $("monthPickerModal").classList.add("open");
}
function closeMonthPicker() {
  $("monthPickerModal").classList.remove("open");
}
function renderMonthSelect() {
  const lbl = $("monthLabel");
  if (lbl) lbl.textContent = state.currentMonth || "--";
}
function switchMonth(label) {
  if (!state.months[label]) return;
  state.currentMonth = label;
  save();
  renderAll();
}
function nextMonthLabel(from) {
  const m = String(from).match(/^(\d{4})\.(\d{1,2})$/);
  if (!m) return from + "a";
  let y = +m[1], mo = +m[2] + 1;
  if (mo > 12) { mo = 1; y++; }
  return y + "." + mo;
}
function newMonth() {
  let label = nextMonthLabel(state.currentMonth);
  while (state.months[label]) label = label + "a";
  // 复制上月品种结构(名称/成本/售价档/库存)，出库数清零
  const src = curMonth();
  const data = newMonthData();
  if (src && src.products.length) {
    data.products = src.products.map((p) => ({
      name: p.name, cost: p.cost, prices: p.prices.slice(),
      stock: p.stock, sales: {},
    }));
  }
  state.months[label] = data;
  state.currentMonth = label;
  save();
  renderAll();
  toast("已新建月份 " + label + (data.products.length ? "（已复制上月品种）" : ""));
}
async function deleteMonth() {
  const keys = sortedMonths();
  if (keys.length <= 1) { toast("至少保留一个月份"); return; }
  if (!(await customConfirm("删除本月「" + state.currentMonth + "」的所有数据？\n此操作不可恢复。"))) return;
  const deletedKey = state.currentMonth;
  const dk = monthSortKey(deletedKey);
  delete state.months[deletedKey];
  // 跳转到比被删除月份更早的、最近的那个月；若没有则落到剩余月份中最老的一个
  const remaining = sortedMonths();
  const earlier = remaining.filter((m) => {
    const sk = monthSortKey(m);
    return sk[0] < dk[0] || (sk[0] === dk[0] && sk[1] < dk[1]);
  });
  state.currentMonth = earlier.length ? earlier[earlier.length - 1] : remaining[0];
  save();
  renderAll();
  toast("已删除月份");
}

// ---------- 品种管理 ----------
let editing = { idx: null, prices: [240, 260, 280, 300] };

function openAddModal() {
  editing = { idx: null, prices: [240, 260, 280, 300] };
  $("modalTitle").textContent = "添加品种";
  $("pName").value = "";
  $("pCost").value = "170";
  $("prodDeleteBtn").hidden = true;
  renderTiers();
  openModal();
}
function openEditModal(idx) {
  const p = curMonth().products[idx];
  editing = { idx, prices: p.prices.slice() };
  $("modalTitle").textContent = "编辑品种";
  $("pName").value = p.name;
  $("pCost").value = p.cost;
  $("prodDeleteBtn").hidden = false;
  renderTiers();
  openModal();
}
function openModal() { $("prodModal").classList.add("open"); }
function closeModal() { $("prodModal").classList.remove("open"); }

function renderTiers() {
  const box = $("priceTiers");
  box.innerHTML = "";
  editing.prices.forEach((px, i) => {
    const row = document.createElement("div");
    row.className = "tier-row";
    row.innerHTML =
      `<input type="number" inputmode="decimal" placeholder="售价" value="${px ?? ""}" data-i="${i}">` +
      `<button type="button" class="tier-del" data-i="${i}">×</button>`;
    box.appendChild(row);
  });
  box.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      editing.prices[+e.target.dataset.i] = e.target.value === "" ? "" : Number(e.target.value);
    });
  });
  box.querySelectorAll(".tier-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      editing.prices.splice(+e.target.dataset.i, 1);
      renderTiers();
    });
  });
}
function addTier() {
  editing.prices.push("");
  renderTiers();
}
function saveProduct() {
  const name = $("pName").value.trim();
  if (!name) { toast("请填写品种名称"); return; }
  const cost = $("pCost").value === "" ? "" : Number($("pCost").value);
  const prices = editing.prices
    .map((v) => (v === "" ? "" : Number(v)))
    .filter((v) => v !== "" && !isNaN(v))
    .sort((a, b) => a - b);
  const m = curMonth();
  if (editing.idx === null) {
    // 同名校验
    if (m.products.some((p) => p.name === name)) { toast("已存在同名品种"); return; }
    m.products.push({ name, cost, prices, stock: "", sales: {} });
  } else {
    const old = m.products[editing.idx];
    // 保留已有 sales（按售价匹配）
    const sales = {};
    prices.forEach((px) => { if (old.sales[px] !== undefined) sales[px] = old.sales[px]; });
    m.products[editing.idx] = { name, cost, prices, stock: old.stock, sales };
  }
  save();
  closeModal();
  renderProducts();
  recalc();
  toast(editing.idx === null ? "已添加「" + name + "」" : "已更新");
}
async function deleteProductFromModal() {
  if (editing.idx === null) return;
  const p = curMonth().products[editing.idx];
  if (!(await customConfirm("删除品种「" + p.name + "」？\n该品种本月出库数据也会清除。"))) return;
  curMonth().products.splice(editing.idx, 1);
  save();
  closeModal();
  renderProducts();
  recalc();
  toast("已删除");
}

// ---------- 渲染产品列表 ----------
function renderProducts() {
  const list = $("productList");
  const prods = curMonth().products;
  list.innerHTML = "";
  $("emptyTip").style.display = prods.length ? "none" : "block";
  prods.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "product";
    const rows = p.prices
      .map(
        (px) =>
          `<div class="price-row" data-name="${idx}" data-price="${px}">
            <span class="px">¥${px}</span>
            <input type="number" inputmode="numeric" min="0" placeholder="0" value="${p.sales[px] ?? ""}">
            <span class="sub">¥0</span>
          </div>`
      )
      .join("");
    card.innerHTML =
      `<div class="product-head">
        <span class="product-name">${escapeHtml(p.name)}</span>
        <span class="product-tag">成本¥${p.cost ?? "-"}</span>
        <span class="product-total" data-total="${idx}">¥0</span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>
      </div>
      <div class="product-body">
        <div class="stock-row">
          <div class="stock-field">
            <label>总库存</label>
            <input type="number" inputmode="numeric" min="0" placeholder="0" data-stock="${idx}" value="${p.stock ?? ""}">
          </div>
          <div class="stock-field">
            <label>剩余</label>
            <input type="number" readonly data-remain="${idx}" value="">
          </div>
        </div>
        <div class="price-rows">${rows}</div>
        <div class="card-actions">
          <button type="button" data-edit="${idx}">编辑品种</button>
          <button type="button" class="btn-del" data-delprod="${idx}">删除品种</button>
        </div>
      </div>`;
    list.appendChild(card);
  });
  bindProductEvents();
  recalc();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function bindProductEvents() {
  document.querySelectorAll(".product-head").forEach((head) => {
    head.addEventListener("click", (e) => {
      if (e.target.closest(".card-actions")) return;
      head.parentElement.classList.toggle("open");
    });
  });
  document.querySelectorAll(".price-row input").forEach((inp) => {
    inp.addEventListener("input", onPriceInput);
    inp.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll("[data-stock]").forEach((inp) => {
    inp.addEventListener("input", onStockInput);
    inp.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(+btn.dataset.edit);
    });
  });
  document.querySelectorAll("[data-delprod]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = +btn.dataset.delprod;
      const p = curMonth().products[idx];
      if (await customConfirm("删除品种「" + p.name + "」？")) {
        curMonth().products.splice(idx, 1);
        save(); renderProducts(); recalc();
        toast("已删除");
      }
    });
  });
}
function onPriceInput(e) {
  const row = e.target.closest(".price-row");
  const idx = +row.dataset.name;
  const price = row.dataset.price;
  const p = curMonth().products[idx];
  if (!p.sales) p.sales = {};
  p.sales[price] = e.target.value;
  save();
  recalc();
}
function onStockInput(e) {
  const idx = +e.target.dataset.stock;
  curMonth().products[idx].stock = e.target.value;
  save();
  recalc();
}

// ---------- 计算 ----------
function productStats(p) {
  let out = 0, sales = 0;
  (p.prices || []).forEach((px) => {
    const q = parseFloat(p.sales && p.sales[px]) || 0;
    out += q; sales += q * px;
  });
  const cost = (parseFloat(p.cost) || 0) * out;
  return { out, sales, cost };
}
function recalc() {
  const m = curMonth(); if (!m) return;
  let totalSales = 0, totalCost = 0, totalOut = 0;
  m.products.forEach((p, idx) => {
    const st = productStats(p);
    totalSales += st.sales; totalCost += st.cost; totalOut += st.out;
    const totalEl = document.querySelector(`[data-total="${idx}"]`);
    if (totalEl) totalEl.textContent = money(st.sales);
    (p.prices || []).forEach((px) => {
      const q = parseFloat(p.sales && p.sales[px]) || 0;
      const sub = document.querySelector(`.price-row[data-name="${idx}"][data-price="${px}"] .sub`);
      if (sub) { sub.textContent = money(q * px); sub.parentElement.classList.toggle("empty", q === 0); }
    });
    const stockVal = parseFloat(p.stock) || 0;
    const remainEl = document.querySelector(`[data-remain="${idx}"]`);
    if (remainEl) remainEl.value = stockVal ? stockVal - st.out : "";
  });
  $("sumSales").textContent = money(totalSales);
  $("sumCost").textContent = money(totalCost);
  $("sumOut").textContent = totalOut;
  const freight = parseFloat($("freight").value) || 0;
  const extra = parseFloat($("extra").value) || 0;
  const rate = parseFloat($("rate").value) || 0;
  const profit = totalSales - totalCost - freight - extra;
  const commission = profit * (rate / 100);
  $("profit").textContent = money(profit);
  $("commission").textContent = money(commission);
  $("rateLabel").textContent = rate;
}

// ---------- 顶部费用/备注绑定 ----------
function autoGrowNotes() {
  const ta = $("notes");
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = Math.max(96, ta.scrollHeight) + "px";
}
function bindGlobals() {
  const m = curMonth();
  $("freight").value = m.freight; $("extra").value = m.extra;
  $("rate").value = m.rate; $("notes").value = m.notes;
  autoGrowNotes();
  ["freight", "extra", "rate", "notes"].forEach((id) => {
    const el = $(id);
    el.oninput = () => {
      curMonth()[id] = el.value;
      save(); recalc();
      if (id === "notes") autoGrowNotes();
    };
  });
}

// ---------- 渲染全部 ----------
function renderAll() {
  renderMonthSelect();
  renderProducts();
  bindGlobals();
  recalc();
}

// ---------- 文件保存（终极版：Filesystem("DOCUMENTS") → navigator.share → a.download）----------
function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result.split(",")[1]); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function saveBlob(filename, blob) {
  var C = typeof window !== "undefined" ? window.Capacitor : null;
  var FS = C && C.Plugins && C.Plugins.Filesystem ? C.Plugins.Filesystem : null;
  if (FS) {
    blobToBase64(blob).then(function (b64) {
      // directory 必须传字符串："DOCUMENTS"（原生 bridge 没有 Directory 枚举）
      return FS.writeFile({ path: filename, data: b64, directory: "DOCUMENTS" });
    }).then(function (res) {
      toast("已导出到「文档」文件夹：\n" + filename);
    }).catch(function (err) {
      var msg = err && err.message ? err.message : String(err);
      toast("写入文档失败：" + msg + "\n尝试分享保存…");
      tryWebShare(filename, blob);
    });
    return;
  }
  tryWebShare(filename, blob);
}

function tryWebShare(filename, blob) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      var file = new File([blob], filename, { type: blob.type });
      navigator.share({ files: [file], title: "导出膏方备份" }).then(function () {
        toast("已导出「" + filename + "」\n请在分享面板中选择保存位置");
      }).catch(function () {
        doDownload(filename, blob);
      });
      return;
    } catch (e) {}
  }
  doDownload(filename, blob);
}

function doDownload(filename, blob) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  toast("已导出「" + filename + "」");
}

// ---------- 导出 xlsx（严格复刻示例样式）----------
var THIN = { style: "thin", color: { auto: 1 } };
var MED = { style: "medium", color: { auto: 1 } };
function mkBorder(l, r, t, b) {
  var o = {};
  if (l) o.left = l === "m" ? MED : THIN;
  if (r) o.right = r === "m" ? MED : THIN;
  if (t) o.top = t === "m" ? MED : THIN;
  if (b) o.bottom = b === "m" ? MED : THIN;
  return o;
}
var FONT_SONG = { name: "宋体", sz: 12, color: { theme: 1 } };
var ALIGN_CC = { horizontal: "center", vertical: "center" };
var ALIGN_LC = { horizontal: "left", vertical: "center" };
// 13 种样式，与示例 styles.xml 的 cellXfs 一一对应
var ST = {
  TL: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("m", "t", "m", "t") },   // s1  A1 左上
  TT: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "t", "m", "t") },   // s2  B1:G1 顶行
  TR: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "m", "m", "t") },   // s3  H1 右上
  ML: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("m", "t", "t", "t") },   // s4  A2:A31 左列
  MM: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "t", "t", "t") },   // s5  B/C/D/G 中间
  EF: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "t", "t", "t") },   // s6  E/F 中间
  MR: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "m", "t", "t") },   // s7  H2:H31 右列
  BL: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("m", "t", "t", "m") },   // s8  A32 左下
  BB: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "t", "t", "m") },   // s9  B32:G32 底行
  BR: { font: FONT_SONG, alignment: ALIGN_CC, border: mkBorder("t", "m", "t", "m") },   // s10 H32 右下
  COST: { font: FONT_SONG, alignment: ALIGN_CC },                                      // s11 B33:B35 费用值
  LABEL: { font: FONT_SONG, alignment: ALIGN_LC },                                     // s12 A33:A36 标签/备注
};

function setCell(ws, r, cIdx, v, t, f, style) {
  var addr = XLSX.utils.encode_cell({ r: r, c: cIdx });
  var cell = { t: t, v: v };
  if (f) cell.f = f;
  if (style) cell.s = style;
  ws[addr] = cell;
}

function exportXlsx() {
  try {
    var wb = XLSX.utils.book_new();
    var months = sortedMonths();
    months.forEach(function (label) {
      var ws = buildStyledMonthWs(state.months[label]);
      XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31));
    });
    var out = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
    var blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    var fname = "膏方提成备份_" + months.join("-") + ".xlsx";
    saveBlob(fname, blob);
  } catch (e) {
    toast("导出失败：" + (e && e.message ? e.message : String(e)));
  }
}

function buildStyledMonthWs(m) {
  var ws = {};
  var products = (m && m.products) || [];
  // 列宽与示例一致
  ws["!cols"] = [
    { wch: 12.17 },
    { wch: 9.17 }, { wch: 9.17 }, { wch: 9.17 }, { wch: 9.17 }, { wch: 9.17 }, { wch: 9.17 }, { wch: 9.17 },
    { wch: 2.42 }, { wch: 8.42 }, { wch: 12.42 },
  ];
  var merges = [];
  ws["!merges"] = merges;

  // ---- Row 1 表头 ----
  var headers = ["产品名称", "总库存", "剩余库存", "成本", "售价", "出库", "总售价", "运费"];
  headers.forEach(function (h, i) {
    var st = i === 0 ? ST.TL : (i === 7 ? ST.TR : ST.TT);
    setCell(ws, 0, i, h, "s", null, st);
  });

  // ---- 产品数据行 ----
  var row = 1; // 0-based，Excel 第 2 行
  var prodRanges = []; // { start, end, name, stock, cost }
  products.forEach(function (p) {
    var tiers = (p.prices && p.prices.length) ? p.prices : [0];
    var n = tiers.length;
    var start = row;
    var end = row + n - 1;
    var stock = parseFloat(p.stock) || 0;
    var cost = parseFloat(p.cost) || 0;
    prodRanges.push({ start: start, end: end, stock: stock, cost: cost });

    // 剩余库存公式：B{r}-SUM(F{r}:F{end})
    var excelStart = start + 1;
    var excelEnd = end + 1;
    var cFormula = "B" + excelStart + "-SUM(F" + excelStart + ":F" + excelEnd + ")";
    // 总售价公式：E{r}*F{r}+E{r+1}*F{r+1}+...
    var gParts = [];
    for (var k = 0; k < n; k++) {
      gParts.push("E" + (excelStart + k) + "*F" + (excelStart + k));
    }
    var gFormula = gParts.join("+");

    // 该产品出库合计 / 总售价合计（公式缓存值）
    var sumOut = 0, sumSale = 0;
    tiers.forEach(function (px) {
      var o = parseFloat(p.sales && p.sales[px]) || 0;
      sumOut += o;
      sumSale += o * (parseFloat(px) || 0);
    });

    tiers.forEach(function (px, i) {
      var r = start + i;
      var o = parseFloat(p.sales && p.sales[px]) || 0;
      // A 名称（首行）/ 空占位（保持边框）
      setCell(ws, r, 0, i === 0 ? (p.name || "") : "", "s", null, ST.ML);
      // B 总库存
      setCell(ws, r, 1, i === 0 ? stock : "", i === 0 ? "n" : "s", null, ST.MM);
      // C 剩余库存（公式，首行）
      if (i === 0) setCell(ws, r, 2, stock - sumOut, "n", cFormula, ST.MM);
      else setCell(ws, r, 2, "", "s", null, ST.MM);
      // D 成本
      setCell(ws, r, 3, i === 0 ? cost : "", i === 0 ? "n" : "s", null, ST.MM);
      // E 售价
      setCell(ws, r, 4, parseFloat(px) || 0, "n", null, ST.EF);
      // F 出库
      setCell(ws, r, 5, o, "n", null, ST.EF);
      // G 总售价（公式，首行）
      if (i === 0) setCell(ws, r, 6, sumSale, "n", gFormula, ST.MM);
      else setCell(ws, r, 6, "", "s", null, ST.MM);
      // H 运费列（占位保持边框，值写在 H2）
      setCell(ws, r, 7, "", "s", null, ST.MR);
    });

    // 合并 A/B/C/D/G 跨产品行
    if (n > 1) {
      [0, 1, 2, 3, 6].forEach(function (cIdx) {
        merges.push({ s: { r: start, c: cIdx }, e: { r: end, c: cIdx } });
      });
    }
    row = end + 1;
  });

  // ---- 合计行 ----
  var totalRow = row; // 0-based
  var dataFirst = 1, dataLast = totalRow - 1; // 0-based 数据行范围
  var eFirst = dataFirst + 1, eLast = dataLast + 1; // Excel 行号
  var eTotal = totalRow + 1;
  // D 合计公式：D2*SUM(F2:F4)+D5*SUM(F5:F7)+...
  var dParts = prodRanges.map(function (pr) {
    return "D" + (pr.start + 1) + "*SUM(F" + (pr.start + 1) + ":F" + (pr.end + 1) + ")";
  });
  // 公式缓存值
  var tStock = 0, tRemain = 0, tCost = 0, tOut = 0, tSale = 0;
  prodRanges.forEach(function (pr, pi) {
    var p = products[pi];
    var tiers = (p.prices && p.prices.length) ? p.prices : [0];
    var so = 0, ss = 0;
    tiers.forEach(function (px) {
      var o = parseFloat(p.sales && p.sales[px]) || 0;
      so += o;
      ss += o * (parseFloat(px) || 0);
    });
    tStock += pr.stock;
    tRemain += pr.stock - so;
    tCost += pr.cost * so;
    tOut += so;
    tSale += ss;
  });
  setCell(ws, totalRow, 0, "合计", "s", null, ST.BL);
  setCell(ws, totalRow, 1, tStock, "n", "SUM(B" + eFirst + ":B" + eLast + ")", ST.BB);
  setCell(ws, totalRow, 2, tRemain, "n", "SUM(C" + eFirst + ":C" + eLast + ")", ST.BB);
  setCell(ws, totalRow, 3, tCost, "n", dParts.join("+"), ST.BB);
  setCell(ws, totalRow, 4, "-", "s", null, ST.BB);
  setCell(ws, totalRow, 5, tOut, "n", "SUM(F" + eFirst + ":F" + eLast + ")", ST.BB);
  setCell(ws, totalRow, 6, tSale, "n", "SUM(G" + eFirst + ":G" + eLast + ")", ST.BB);
  setCell(ws, totalRow, 7, "", "s", null, ST.BR);
  // 合计行行高 15.5（示例 thickBot 行）
  ws["!rows"] = [];
  ws["!rows"][totalRow] = { hpt: 15.5 };

  // ---- H 列运费合并：H2 到合计行 ----
  if (totalRow > 1) {
    merges.push({ s: { r: 1, c: 7 }, e: { r: totalRow, c: 7 } });
  }
  var shipping = parseFloat(m.freight) || 0;
  setCell(ws, 1, 7, shipping, "n", null, ST.MR); // H2 运费值

  // ---- 费用区 ----
  var extraRow = totalRow + 1;
  var rateRow = totalRow + 2;
  var commRow = totalRow + 3;
  var notesRow = totalRow + 4;
  var extra = parseFloat(m.extra) || 0;
  var rate = parseFloat(m.rate);
  if (isNaN(rate)) rate = 30;
  setCell(ws, extraRow, 0, "额外支出", "s", null, ST.LABEL);
  setCell(ws, extraRow, 1, extra, "n", null, ST.COST);
  setCell(ws, rateRow, 0, "提成比例(%)", "s", null, ST.LABEL);
  setCell(ws, rateRow, 1, rate, "n", null, ST.COST);
  setCell(ws, commRow, 0, "提成", "s", null, ST.LABEL);
  var commFormula = "(G" + eTotal + "-D" + eTotal + "-H2-B" + (extraRow + 1) + ")*B" + (rateRow + 1) + "/100";
  var profit = tSale - tCost - shipping - extra;
  setCell(ws, commRow, 1, Math.round(profit * rate) / 100, "n", commFormula, ST.COST);
  setCell(ws, notesRow, 0, "备注", "s", null, ST.LABEL);
  setCell(ws, notesRow, 1, m.notes || "", "s", null, ST.LABEL);

  // ---- 范围 ----
  ws["!ref"] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: notesRow, c: 7 });
  return ws;
}

function importXlsx(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      let imported = 0;
      wb.SheetNames.forEach((sheetName) => {
        const ws = wb.Sheets[sheetName];
        if (!ws) return;
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        const parsed = parseMonthAoa(aoa);
        if (parsed) {
          state.months[sheetName] = parsed;
          imported++;
        }
      });
      if (imported === 0) { toast("未识别到有效数据"); return; }
      state.currentMonth = Object.keys(state.months)[0];
      save();
      renderAll();
      toast("已导入 " + imported + " 个月份数据");
    } catch (err) {
      console.error(err);
      toast("导入失败：" + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
function parseMonthAoa(aoa) {
  if (!aoa || !aoa.length) return null;
  // 找表头行（含“产品名称”和“售价”）
  let hdr = -1, col = {};
  for (let i = 0; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r) continue;
    const joined = r.join("|");
    if (joined.indexOf("产品名称") >= 0 && joined.indexOf("售价") >= 0) {
      hdr = i;
      r.forEach((v, idx) => {
        const s = String(v).trim();
        if (s === "产品名称") col.name = idx;
        else if (s === "总库存") col.stock = idx;
        else if (s === "剩余库存") col.remain = idx;
        else if (s === "成本") col.cost = idx;
        else if (s === "售价") col.price = idx;
        else if (s === "出库") col.qty = idx;
        else if (s === "运费") col.freight = idx;
      });
      break;
    }
  }
  if (hdr < 0) return null;
  const c = {
    name: col.name ?? 0, stock: col.stock ?? 1, remain: col.remain ?? 2,
    cost: col.cost ?? 3, price: col.price ?? 4, qty: col.qty ?? 5,
  };
  const data = { products: [], freight: "", extra: "", rate: "30", notes: "" };
  let cur = null; // 当前品种
  let hitTotal = false;
  for (let i = hdr + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const a = String(r[c.name] ?? "").trim();
    if (!hitTotal) {
      if (a === "合计") { hitTotal = true; continue; }
      if (a === "") {
        // 续行：补充售价/出库
        if (cur) {
          const px = numOrEmpty(r[c.price]);
          const q = numOrEmpty(r[c.qty]);
          if (px !== "" && q !== "") {
            cur.sales[px] = q;
            if (!cur.prices.includes(px)) cur.prices.push(px);
          }
        }
        continue;
      }
      // 新品种
      const px = numOrEmpty(r[c.price]);
      const q = numOrEmpty(r[c.qty]);
      const cost = numOrEmpty(r[c.cost]);
      cur = {
        name: a,
        cost: cost === "" ? "" : cost,
        prices: px !== "" ? [px] : [],
        stock: numOrEmpty(r[c.stock]) === "" ? "" : numOrEmpty(r[c.stock]),
        sales: {},
      };
      if (px !== "" && q !== "") cur.sales[px] = q;
      data.products.push(cur);
    } else {
      // 元数据行 label/value
      const val = r.length > 1 ? r[1] : "";
      if (a === "运费") data.freight = String(val);
      else if (a === "额外支出") data.extra = String(val);
      else if (a.indexOf("提成比例") >= 0) data.rate = String(val);
      else if (a === "备注") data.notes = String(val);
    }
  }
  data.products.forEach((p) => (p.prices = p.prices.sort((x, y) => x - y)));
  // 新导出格式：运费在数据区 H 列合并首格（表头行+1），若无"运费"标签行则从该处读取
  if (data.freight === "" && col.freight !== undefined) {
    const fr = aoa[hdr + 1] || [];
    const fv = numOrEmpty(fr[col.freight]);
    if (fv !== "") data.freight = String(fv);
  }
  return data;
}
function numOrEmpty(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  return isNaN(n) ? "" : n;
}

// ---------- 工具 ----------
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- 中文确认弹窗 ----------
let confirmResolver = null;
function customConfirm(msg) {
  return new Promise((resolve) => {
    const msgEl = $("confirmMsg");
    const modalEl = $("confirmModal");
    // 防御：若 HTML 缺失该弹窗元素，回退到原生 confirm
    if (!msgEl || !modalEl) { resolve(window.confirm(msg)); return; }
    msgEl.textContent = msg;
    modalEl.classList.add("open");
    confirmResolver = resolve;
  });
}
function closeConfirm(val) {
  if (confirmResolver === null) return;
  const modalEl = $("confirmModal");
  if (modalEl) modalEl.classList.remove("open");
  const r = confirmResolver;
  confirmResolver = null;
  r(val);
}

// ---------- 事件绑定 ----------
function on(id, ev, handler) {
  const el = $(id);
  if (el) el.addEventListener(ev, handler);
}
function bindUI() {
  on("monthPickerBtn", "click", openMonthPicker);
  on("monthPickerCancel", "click", closeMonthPicker);
  on("monthPickerModal", "click", (e) => { if (e.target.id === "monthPickerModal") closeMonthPicker(); });
  on("newMonthBtn", "click", newMonth);
  on("delMonthBtn", "click", deleteMonth);
  on("addProdBtn", "click", openAddModal);
  on("exportBtn", "click", exportXlsx);
  on("importBtn", "click", () => $("importFile").click());
  on("importFile", "change", (e) => {
    if (e.target.files[0]) {
      importXlsx(e.target.files[0]);
      e.target.value = "";
    }
  });
  on("addTierBtn", "click", addTier);
  on("prodSaveBtn", "click", saveProduct);
  on("prodCancelBtn", "click", closeModal);
  on("prodDeleteBtn", "click", deleteProductFromModal);
  on("prodModal", "click", (e) => {
    if (e.target === $("prodModal")) closeModal();
  });
  on("confirmOk", "click", () => closeConfirm(true));
  on("confirmCancel", "click", () => closeConfirm(false));
  on("confirmModal", "click", (e) => {
    if (e.target === $("confirmModal")) closeConfirm(false);
  });
  on("resetBtn", "click", async () => {
    if (!(await customConfirm("清空本月所有出库数量？\n品种和库存保留。"))) return;
    const m = curMonth();
    m.products.forEach((p) => (p.sales = {}));
    save();
    renderProducts();
    recalc();
    toast("已清空本月出库");
  });
}

// ---------- 启动 ----------
bindUI();
renderAll();
