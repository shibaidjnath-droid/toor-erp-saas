// === TOOR ERP SaaS Dashboard v3 ===
// CRUD, modals, thema-switch, global search, dummydata & toasts
window.addEventListener("load", async () => {
  const res = await fetch("/api/clients");
  clients = await res.json();
  renderClients();
});

// ---------- Globale data ----------
let activeTab = "clients";
let settings = {
  typeServices: ["Glasbewassing", "Schoonmaak", "Tuinonderhoud"],
  frequencies: ["Wekelijks", "Maandelijks", "Kwartaal"],
  roles: ["Schoonmaker", "Teamleider", "Planner"],
  tags: ["Particulier", "Zakelijk", "VvE"],
  reasons: ["Vakantie", "Ziek", "Niet meer werkzaam bij ons"],
};


let clients = [];
let contracts = [];
let planning = [];
let invoices = [];
let members = [];
let emailLog = [];
let leads = [];
let quotes = [];
let tags = [];

// =========================================================
// 🌍 Centrale datum helpers (NL formaat)
// =========================================================

// ISO → dd-mm-yyyy
function toNLDate(iso) {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.split("T")[0].split("-");
    return `${d}-${m}-${y}`;
  } catch {
    return iso;
  }
}

// dd-mm-yyyy → yyyy-mm-dd
function fromNLDate(nl) {
  if (!nl) return "";
  try {
    const [d, m, y] = nl.split("-");
    return `${y}-${m}-${d}`;
  } catch {
    return nl;
  }
}

// =========================================================
// 🛠️ Helpers om datumvelden in modals NL ↔ ISO te converteren
// =========================================================
function nlToIsoInput(nlDate) {
  if (!nlDate) return "";
  const [d, m, y] = nlDate.split("-");
  return `${y}-${m}-${d}`;
}

function isoInputToNL(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// 🔁 Universele fetch-functie om altijd actuele data te laden
async function fetchClients() {
  try {
    const res = await fetch("/api/clients");
    if (!res.ok) throw new Error("Fout bij ophalen klanten");
    clients = await res.json();
  } catch (err) {
    console.error("❌ Fout bij herladen klanten:", err);
    showToast("Fout bij herladen klanten", "error");
  }
}

// ---------- Initialisatie ----------
window.addEventListener("load", () => {
  setupTabs();
  setupThemeButtons();
  setupGlobalSearch();
  loadTab("clients");
});

// ---------- Tabs ----------
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => loadTab(btn.dataset.tab));
  });
}

function loadTab(tabId) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
  document.getElementById(tabId).classList.remove("hidden");
  activeTab = tabId;
  document.getElementById("activeTabLabel").textContent =
    tabId === "searchResults" ? "Zoekresultaten" :
    tabId.charAt(0).toUpperCase() + tabId.slice(1);

  switch (tabId) {
    case "clients": renderClients(); break;
    case "contracts": renderContracts(); break;
    case "planning": renderPlanning(); break;
    case "invoices": renderInvoices(); break;
    case "members": renderMembers(); break;
    case "emailLog": renderEmailLog(); break;
    case "leads": renderLeads(); break;
    case "quotes": renderQuotes(); break;
    case "settings": renderSettings(); break;
  }
}

// ========== Global Search ==========
function setupGlobalSearch() {
  const input = document.getElementById("globalSearch");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = e.target.value.trim();
      if (q) performGlobalSearch(q);
    }
  });
}

function performGlobalSearch(query) {
  query = query.toLowerCase();
  const results = [];
  const datasets = {
    clients, contracts, planning, invoices, members, leads, quotes, emailLog
  };

  const labelMap = {
    clients: "Klanten",
    contracts: "Contracten",
    planning: "Planning",
    invoices: "Facturen",
    members: "Medewerkers",
    leads: "Leads",
    quotes: "Offertes",
    emailLog: "E-mail log"
  };

  const getLabel = {
    clients: c => c.name,
    contracts: c => `${clients.find(x=>x.id===c.clientId)?.name || "Onbekend"} – ${c.description}`,
    planning: p => `${contracts.find(c=>c.id===p.contractId)?.description || "-"} – ${p.date}`,
    invoices: i => `${clients.find(c=>c.id===i.clientId)?.name || "-"} – €${i.amount}`,
    members: m => m.name,
    leads: l => `${l.name} (${l.email})`,
    quotes: q => `${q.title} – ${q.contact || ""}`,
    emailLog: e => `${e.subject} (${e.to})`
  };

  Object.entries(datasets).forEach(([tab, arr]) => {
    arr.forEach(item => {
      if (JSON.stringify(item).toLowerCase().includes(query)) {
        results.push({ tab, id: item.id, label: getLabel[tab](item) });
      }
    });
  });

  renderSearchResults(query, results, labelMap);
}

function renderSearchResults(query, results, labelMap) {
  loadTab("searchResults");
  const el = document.getElementById("searchResultsList");
  if (!results.length) {
    el.innerHTML = `<p class="text-gray-500">Geen resultaten voor "<strong>${query}</strong>".</p>`;
    return;
  }

  // groepeer resultaten per tab
  const grouped = {};
  results.forEach(r => {
    if (!grouped[r.tab]) grouped[r.tab] = [];
    grouped[r.tab].push(r);
  });

  el.innerHTML = `
    <div class="mb-4 text-gray-500">
      <h2 class="text-xl font-semibold">Zoekresultaten voor "<span class="text-primary">${query}</span>"</h2>
      <p>${results.length} resultaten gevonden in ${Object.keys(grouped).length} categorieën</p>
    </div>
    ${Object.entries(grouped).map(([tab, items]) => `
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-2">${labelMap[tab] || tab} <span class="text-sm text-gray-400">(${items.length})</span></h3>
        <ul class="space-y-1">
          ${items.map(r => `
            <li class="hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded cursor-pointer"
                onclick="openFromSearch('${r.tab}', ${r.id})">
              ${r.label}
            </li>`).join("")}
        </ul>
      </div>
    `).join("")}
  `;
  showToast(`${results.length} resultaten gevonden`, "info");
}


function openFromSearch(tab, id) {
  loadTab(tab);
  const map = { clients, contracts, planning, invoices, members, leads, quotes };
  const arr = map[tab];
  const item = arr.find(x => x.id === id);
  if (!item) return;
  switch (tab) {
    case "clients": openClientDetail(item); break;
    case "contracts": openContractDetail(item); break;
    case "planning": openPlanningDetail(item); break;
    case "invoices": openInvoiceDetail(item); break;
    case "members": openMemberDetail(item); break;
    case "leads": openLeadDetail(item); break;
    case "quotes": openQuoteDetail(item); break;
  }
}
// ---------- Rendering Tabs ----------

// ---------- 🧍 Klanten ----------
async function renderClients() {
  const list = document.getElementById("clientsList");

  // ✅ Klanten ophalen als niet aanwezig
  if (!Array.isArray(clients) || !clients.length) {
    const res = await fetch("/api/clients");
    if (!res.ok) {
      showToast("Fout bij laden klanten", "error");
      return;
    }
    clients = await res.json();
  }

 // 🔹 Zoek + filters + knoppen rechts (zoals Planning)
// 🔹 Eén regel header met alles erin
  list.innerHTML = `
  <div class="flex flex-wrap justify-between items-center mb-2 gap-2">
    <h2 class="text-xl font-semibold">Klanten</h2>

    <div class="flex flex-wrap items-center gap-2 justify-end">
      <input id="clientSearch" type="text" placeholder="Zoek..."
        class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700" />

      <select id="filterType" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
        <option value="">Type Klant</option>
        ${["Particulier", "Zakelijk"].map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>

      <select id="filterTag" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
        <option value="">Tag</option>
        ${(settings.tags || []).map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>

      <select id="filterStatus" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
        <option value="">Status</option>
        ${["Active", "Inactive"].map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>

      <select id="filterMethod" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
        <option value="">Verzendmethode</option>
        ${["Email", "Whatsapp"].map(t => `<option value="${t}">${t}</option>`).join("")}
      </select>

      <!-- ✅ Hier plaatsen we de bestaande functionele knoppen -->
      <button id="importClientsBtn" class="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700">📥 Import</button>
      <button id="exportClientsBtn" class="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700">📤 Export</button>
      <button id="newClientBtn" class="bg-primary text-white px-4 py-2 rounded hover:bg-blue-700">+ Nieuw Klant</button>
    </div>
  </div>

  <div class="overflow-y-auto max-h-[70vh] relative" id="clientsTable"></div>
`;





  const tableContainer = document.getElementById("clientsTable");

  // 🔎 Filterfunctie
  function renderFiltered() {
    const fType = document.getElementById("filterType").value.toLowerCase();
    const fTag = document.getElementById("filterTag").value.toLowerCase();
    const fStatus = document.getElementById("filterStatus").value.toLowerCase();
    const fMethod = document.getElementById("filterMethod").value.toLowerCase();
    const search = document.getElementById("clientSearch").value.toLowerCase();

    const filtered = clients.filter(c => {
      const matchesType = !fType || (c.type_klant || "").toLowerCase() === fType;
      let tagValue = Array.isArray(c.tag) ? c.tag.join(", ") : (c.tag || "");
      const matchesTag = !fTag || tagValue.toLowerCase().includes(fTag);
      const matchesStatus = !fStatus || (c.status || "").toLowerCase() === fStatus;
      const matchesMethod = !fMethod || (c.verzend_methode || "").toLowerCase() === fMethod;
      const matchesSearch =
        !search ||
        Object.values(c).join(" ").toLowerCase().includes(search);
      return matchesType && matchesTag && matchesStatus && matchesMethod && matchesSearch;
    });

    const rows = filtered.map(c => [
      c.name,
      c.email,
      c.phone,
      c.type_klant,
      c.verzend_methode,
      c.tag || "-",
      c.status || "Active"
    ]);

    tableContainer.innerHTML = tableHTML(
      ["Naam", "E-mail", "Telefoon", "Type klant", "Verzendmethode", "Tag", "Status"],
      rows
    );

    tableContainer.querySelectorAll("tbody tr").forEach((tr, i) =>
      tr.addEventListener("click", () => openClientDetail(filtered[i]))
    );
  }

  // 🔄 Filters activeren
  ["filterType", "filterTag", "filterStatus", "filterMethod", "clientSearch"].forEach(id =>
    document.getElementById(id).addEventListener("input", renderFiltered)
  );

  renderFiltered();

  // ✅ Nieuw klant toevoegen (volledige bestaande logica)
document.getElementById("newClientBtn").onclick = () => {
  openModal("Nieuwe Klant", [
    { id: "name", label: "Naam" },
    { id: "email", label: "E-mail" },
    { id: "phone", label: "Telefoon" },
    { id: "address", label: "Adres" },
    { id: "houseNumber", label: "Huisnummer" },
    { id: "postcode", label: "Postcode" },
    { id: "city", label: "Plaats" },
    { id: "typeKlant", label: "Type Klant", type: "select", options: ["Particulier", "Zakelijk"], value: "Particulier" },
    { id: "bedrijfsnaam", label: "Bedrijfsnaam", hidden: true },
    { id: "kvk", label: "KvK", hidden: true },
    { id: "btw", label: "BTW-nummer", hidden: true },
    { id: "verzendMethode", label: "Verzendmethode", type: "select", options: ["Whatsapp", "Email"], value: "Email" },
    { id: "tag", label: "Tag", type: "select", options: settings.tags },
    { id: "contract_typeService", label: "Contract: Type Service", type: "multiselect", options: settings.typeServices },
    { id: "contract_frequency", label: "Contract: Frequentie", type: "select", options: settings.frequencies },
    { id: "contract_priceInc", label: "Contract: Prijs incl. (€)" },
    { id: "contract_vat", label: "Contract: BTW (%)", type: "number", value: 21, disabled: true },
    { id: "contract_lastVisit", label: "Contract: Laatste bezoek", type: "date" },
  ], async (vals) => {
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      if (!res.ok) return showToast("Fout bij opslaan klant", "error");

      const klant = await res.json();
      const klantNaam = klant.name || klant.bedrijfsnaam || "(Onbekende naam)";
      showToast(`Klant ${klantNaam} aangemaakt`, "success");

      // ✅ Herlaad volledige lijst uit database zodat nieuwe direct zichtbaar is
      await fetchClients();
      renderClients();

      // ✅ Indien contractvelden ingevuld zijn → contractlijst vernieuwen
      if (vals.contract_typeService || vals.contract_description) {
        const cRes = await fetch("/api/contracts");
        if (cRes.ok) {
          contracts = await cRes.json();
          showToast("Contract gekoppeld en bijgewerkt", "success");
        }
      }
    } catch (err) {
      console.error("❌ Opslaan klant:", err);
      showToast("Onverwachte fout", "error");
    }
  }); // ⬅️ dit haakje sluit openModal()

  // 🔄 Automatische veldlogica (Type Klant → BTW% en bedrijfsvelden)
// 🔄 Automatische veldlogica (Type Klant → BTW% en bedrijfsvelden)
setTimeout(() => {
  const modal = document.querySelector(".modal-card");
  if (!modal) return;

  // Pak velden generiek (maakt niet uit of het select of input is)
  const typeSelect = modal.querySelector("[name='typeKlant']");
  const vatField = modal.querySelector("[name='contract_vat']");
  const bedrijfsnaamWrap = modal.querySelector("[name='bedrijfsnaam']")?.closest(".form-field");
  const kvkWrap = modal.querySelector("[name='kvk']")?.closest(".form-field");
  const btwWrap = modal.querySelector("[name='btw']")?.closest(".form-field");

  const updateFields = () => {
    if (!typeSelect) return;
    const zakelijk = typeSelect.value === "Zakelijk";

    // BTW%: Zakelijk = 21%, Particulier = 0% (pas aan als je andere logica wilt)
    if (vatField) vatField.value = zakelijk ? 21 : 21;

    // Bedrijfsvelden tonen/verbergen
    if (bedrijfsnaamWrap) bedrijfsnaamWrap.style.display = zakelijk ? "" : "none";
    if (kvkWrap) kvkWrap.style.display = zakelijk ? "" : "none";
    if (btwWrap) btwWrap.style.display = zakelijk ? "" : "none";
  };

  updateFields();
  typeSelect?.addEventListener("change", updateFields);
}, 0);

// 🔄 OpenPostcode.nl integratie (gratis, zonder API-key)
setTimeout(() => {
  const modal = document.querySelector(".modal-card");
  if (!modal) return;

  const streetField = modal.querySelector("[name='address']");
  const numberField = modal.querySelector("[name='houseNumber']");
  const pcField     = modal.querySelector("[name='postcode']");
  const cityField   = modal.querySelector("[name='city']");

  // Spinner
  function toggleSpinner(show) {
    let spinner = modal.querySelector(".loading-icon");
    if (show) {
      if (!spinner) {
        spinner = document.createElement("span");
        spinner.className = "loading-icon";
        cityField.parentElement.appendChild(spinner);
      }
    } else {
      spinner?.remove();
    }
  }

  // Helper: normaliseer postcode (1234 AB)
  const formatPostcode = (pc) => {
    const s = (pc || "").toUpperCase().replace(/\s+/g, "");
    if (/^\d{4}[A-Z]{2}$/.test(s)) return s.slice(0,4) + " " + s.slice(4);
    return pc;
  };

  // ✅ A: Postcode + huisnummer → straat + woonplaats
  async function lookupAddress() {
    const pc = (pcField.value || "").replace(/\s+/g, "");
    const hn = numberField.value.trim();
    if (!/^\d{4}[A-Za-z]{2}$/.test(pc) || !hn) return;

    toggleSpinner(true);
    try {
      const url = `/api/address/lookup-address?postcode=${encodeURIComponent(pc)}&huisnummer=${encodeURIComponent(hn)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data?.straat && data?.woonplaats) {
        streetField.value = data.straat;
        cityField.value   = data.woonplaats;
        pcField.value     = formatPostcode(data.postcode);
        showToast("Adres automatisch ingevuld", "success");
      } else {
        showToast("Adres niet gevonden", "warning");
      }
    } catch (err) {
      console.warn("lookupAddress error:", err);
      showToast("Adres niet gevonden", "warning");
    } finally {
      toggleSpinner(false);
    }
  }

  // ✅ B: Straat + plaats + huisnummer → postcode
  async function lookupPostcode() {
    const street = streetField.value.trim();
    const city   = cityField.value.trim();
    const hn     = numberField.value.trim();
    if (!street || !city || !hn) return;

    toggleSpinner(true);
  try {
    console.log("🔎 Lookup URL", `/api/address/lookup-postcode?straat=${encodeURIComponent(street)}&plaats=${encodeURIComponent(city)}&huisnummer=${encodeURIComponent(hn)}`);
    
    const url = `/api/address/lookup-postcode?straat=${encodeURIComponent(street)}&plaats=${encodeURIComponent(city)}&huisnummer=${encodeURIComponent(hn)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (res.ok && data?.postcode) {
      pcField.value = formatPostcode(data.postcode);
      showToast(`Postcode automatisch ingevuld (${data.source || "pdok"})`, "success");
    } else {
      showToast("Postcode niet gevonden", "warning");
    }
  } catch (err) {
    console.warn("lookupPostcode error:", err);
    showToast("Postcode niet gevonden", "warning");
  } finally {
    toggleSpinner(false);
    }
  }

  // Events
  pcField.addEventListener("blur", lookupAddress);
  numberField.addEventListener("blur", lookupAddress);
  streetField.addEventListener("blur", lookupPostcode);
  cityField.addEventListener("blur", lookupPostcode);
}, 0);
// 🔄 KVK lookup integratie
setTimeout(() => {
   const ENABLE_KVK_LOOKUP = false; // ⛔ tijdelijk uitgeschakeld
  if (!ENABLE_KVK_LOOKUP) return;  // ⛔ lookup op pauze

  const typeSelect = modal.querySelector("[name='typeKlant']");
  const kvkField   = modal.querySelector("[name='kvk']");
  const nameField  = modal.querySelector("[name='bedrijfsnaam']");
  const addressField = modal.querySelector("[name='address']");
  const cityField  = modal.querySelector("[name='city']");

  // ✅ A: KVK-nummer → alleen bedrijfsnaam ophalen
kvkField?.addEventListener("blur", async () => {
  if (typeSelect?.value !== "Zakelijk") return;
  const kvk = kvkField.value.trim();
  if (!kvk) return;

  try {
    const res = await fetch(`/api/kvk/by-number/${encodeURIComponent(kvk)}`);
    const data = await res.json();
    if (res.ok && data?.handelsnaam) {
      nameField.value = data.handelsnaam;
      showToast(`Bedrijfsnaam gevonden: ${data.handelsnaam}`, "success");
    } else {
      showToast("Geen bedrijf gevonden met dit KVK-nummer", "warning");
    }
  } catch (err) {
    console.warn("KVK by-number lookup failed:", err);
    showToast("Fout bij ophalen KVK-gegevens", "error");
  }
});


  // ✅ B: Bedrijfsnaam → KVK-nummer
  nameField?.addEventListener("blur", async () => {
    if (typeSelect?.value !== "Zakelijk") return;
    const name = nameField.value.trim();
    const city = cityField.value.trim();
    const addr = addressField.value.trim();
    if (!name) return;
    if (kvkField.value) return; // al ingevuld

    try {
      const res = await fetch(`/api/kvk/by-name?handelsnaam=${encodeURIComponent(name)}&plaats=${encodeURIComponent(city || "")}`);
      const data = await res.json();
      if (res.ok && data?.kvk) {
        kvkField.value = data.kvk;
        showToast(`KVK gevonden: ${data.kvk}`, "success");
      } else {
        showToast("Geen KVK gevonden voor deze bedrijfsnaam", "warning");
      }
    } catch (err) {
      console.warn("KVK by-name lookup failed:", err);
      showToast("Fout bij zoeken naar KVK", "error");
    }
  });
}, 0);

};


  // ✅ Import knop
  document.getElementById("importClientsBtn").onclick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx";
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import-export?type=clients", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Import voltooid: ${data.inserted} klanten toegevoegd`, "success");
        await renderClients();
      } else {
        showToast(`Fout bij import: ${data.error}`, "error");
      }
    };
    input.click();
  };

  // ✅ Export knop
  document.getElementById("exportClientsBtn").onclick = async () => {
    const res = await fetch("/api/import-export?type=clients");
    if (!res.ok) return showToast("Fout bij exporteren", "error");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "klanten_export.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
    showToast("Export succesvol gedownload", "success");
  };
}



function openClientDetail(c) {
  openModal(`Klant bewerken – ${c.name}`, [
    { id: "id", label: "Klant ID", value: c.id, readonly: true },
    { id: "name", label: "Naam", value: c.name },
    { id: "email", label: "E-mail", value: c.email },
    { id: "phone", label: "Telefoon", value: c.phone },
    { id: "address", label: "Adres", value: c.address },
    { id: "houseNumber", label: "Huisnummer", value: c.house_number },
    { id: "postcode", label: "Postcode", value: c.postcode || "" },
    { id: "city", label: "Plaats", value: c.city },
    { id: "typeKlant", label: "Type Klant", type: "select", options: ["Particulier", "Zakelijk"], value: c.type_klant },
    { id: "bedrijfsnaam", label: "Bedrijfsnaam", value: c.bedrijfsnaam || "", hidden: c.type_klant !== "Zakelijk" },
    { id: "kvk", label: "KvK", value: c.kvk || "", hidden: c.type_klant !== "Zakelijk" },
    { id: "btw", label: "BTW", value: c.btw || "", hidden: c.type_klant !== "Zakelijk" },
    { id: "verzendMethode", label: "Verzendmethode", type: "select", options: ["Whatsapp", "Email"], value: c.verzend_methode },
    { id: "tag", label: "Tag", type: "select", options: settings.tags, value: c.tag },
    { id: "status", label: "Status", type: "select", options: ["Active", "Inactive"], value: c.status },
    {
      id: "cancel_reason",
      label: "Reden beëindiging",
      type: "select",
      options: [
        "Contract stop gezet door klant",
        "Contract stop gezet door ons"
      ],
      // 🔥 (oude showIf mag weg — zie uitleg hieronder)
    },
  ], async (vals) => {
    const res = await fetch(`/api/clients/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vals),
    });

    if (!res.ok) {
      showToast("Fout bij opslaan klant", "error");
      return;
    }

    const updated = await res.json();
    Object.assign(c, updated);
    showToast("Klant opgeslagen", "success");
    renderClients();
  }, () => confirmDelete("klant", async () => {
    const idx = clients.findIndex(x => x.id === c.id);
    if (idx > -1) clients.splice(idx, 1);
    showToast("Klant verwijderd", "success");
    renderClients();
  }));

  // --- Dynamisch tonen/verbergen Reden beëindiging ---
setTimeout(() => {
  const modal = document.querySelector(".modal-card");
  if (!modal) return;

  // ✅ Gebruik name-selectors in plaats van id
  const statusSelect = modal.querySelector('[name="status"]');
  const reasonSelect = modal.querySelector('[name="cancel_reason"]');
  if (!statusSelect || !reasonSelect) return;

  // direct verbergen bij start
  reasonSelect.closest(".form-field").style.display = "none";

  function toggleReasonField() {
    if (statusSelect.value === "Inactive") {
      reasonSelect.closest(".form-field").style.display = "block";
      reasonSelect.required = true;
    } else {
      reasonSelect.closest(".form-field").style.display = "none";
      reasonSelect.required = false;
      reasonSelect.value = "";
    }
  }

  toggleReasonField();
  statusSelect.addEventListener("change", toggleReasonField);
}, 50);
}




// ---------- 📄 Contracten ----------
async function renderContracts() {
  const list = document.getElementById("contractsList");

  try {
    // ✅ Live data ophalen
    const res = await fetch("/api/contracts");
    if (!res.ok) throw new Error("Fout bij ophalen contracten");
    contracts = await res.json();

    // 🔹 Filters + zoekveld boven tabel
 list.innerHTML = `
  <div class="flex flex-wrap justify-between items-center mb-2 gap-2">
    <h2 class="text-xl font-semibold">Contracten</h2>

    <div class="flex flex-wrap items-center gap-2 justify-end">
      <input id="contractSearch" type="text" placeholder="Zoek..."
        class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700" />

      <select id="filterFrequency" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
        <option value="">Frequentie</option>
        ${(settings.frequencies || []).map(f => `<option value="${f}">${f}</option>`).join("")}
      </select>

      <div class="relative">
        <button id="filterTypeServiceBtn"
          class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700 min-w-[140px] flex items-center justify-between">
          <span id="filterTypeServiceLabel">Type Service</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div id="filterTypeServiceMenu"
          class="absolute right-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded shadow-md z-50 hidden max-h-48 overflow-y-auto w-48">
          ${(settings.typeServices || [])
            .map(s => `
              <label class="flex items-center px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                <input type="checkbox" value="${s}" class="mr-2 typeServiceChk"> ${s}
              </label>
            `).join("")}
        </div>
      </div>

      <!-- ✅ Bestaande knop -->
      <button id="newContractBtn" class="bg-primary text-white px-4 py-2 rounded hover:bg-blue-700">+ Nieuw Contract</button>
    </div>
  </div>

  <div class="overflow-y-auto max-h-[70vh] relative" id="contractsTable"></div>
`;


    const tableContainer = document.getElementById("contractsTable");

    // ▼ Dropdown open/dicht
    const btn = document.getElementById("filterTypeServiceBtn");
    const menu = document.getElementById("filterTypeServiceMenu");
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    };
    document.addEventListener("click", () => menu.classList.add("hidden"));

    // 🔍 Filterfunctie
    function renderFiltered(selectedTypes = []) {
      const fSearch = document.getElementById("contractSearch").value.toLowerCase();
      const fFreq = document.getElementById("filterFrequency").value.toLowerCase();
      const fTypeServices = selectedTypes.length
        ? selectedTypes
        : Array.from(menu.querySelectorAll(".typeServiceChk:checked")).map(o => o.value.toLowerCase());

      const filtered = contracts.filter(c => {
        const services = Array.isArray(c.type_service)
          ? c.type_service.map(s => s.toLowerCase())
          : [(c.type_service || "").toLowerCase()];

        const matchesType =
          !fTypeServices.length ||
          fTypeServices.some(sel => services.includes(sel));

        const matchesFreq = !fFreq || (c.frequency || "").toLowerCase() === fFreq;
        const matchesSearch = !fSearch || Object.values(c).join(" ").toLowerCase().includes(fSearch);

        return matchesSearch && matchesFreq && matchesType;
      });

      // 🔹 Tabel renderen
      const rows = filtered.map(c => [
        c.client_name || "-",
        Array.isArray(c.type_service) ? c.type_service.join(", ") : (c.type_service || "-"),
        c.frequency || "-",
        c.description || "-",
        c.price_inc ? `€${Number(c.price_inc).toFixed(2)}` : "€0.00",
        c.vat_pct ? `${c.vat_pct}%` : "-",
        c.last_visit ? c.last_visit.split("T")[0] : "-",
        c.next_visit ? c.next_visit.split("T")[0] : "-",
        c.maandelijkse_facturatie ? "Ja" : "Nee",
        c.contract_beeindigd || "Nee",
        c.contract_eind_datum ? c.contract_eind_datum.split("T")[0] : "-"
      ]);

      tableContainer.innerHTML = tableHTML(
        ["Klant", "Type Service", "Frequentie", "Beschrijving", "Prijs incl.", "BTW", "Laatste bezoek", "Volgende bezoek", "Maandelijkse facturatie", "Beëindigd", "Einddatum"],
        rows
      );

      // 🔗 Klik op rij → open detail
      tableContainer.querySelectorAll("tbody tr").forEach((tr, i) =>
        tr.addEventListener("click", () => openContractDetail(filtered[i]))
      );
    }

    // ▼ Checkbox-filter
    menu.querySelectorAll(".typeServiceChk").forEach(chk =>
      chk.addEventListener("change", () => {
        const selected = Array.from(menu.querySelectorAll(".typeServiceChk:checked")).map(c => c.value.toLowerCase());
        const label = document.getElementById("filterTypeServiceLabel");
        label.textContent = selected.length ? `${selected.length} geselecteerd` : "Type Service";
        renderFiltered(selected);
      })
    );

    // 🔄 Events koppelen
    ["contractSearch", "filterFrequency"].forEach(id =>
      document.getElementById(id).addEventListener("input", () => renderFiltered())
    );

    // ✅ Eerste render
    renderFiltered();

    // ✅ Nieuw contract toevoegen
document.getElementById("newContractBtn").onclick = () => {
  openModal("Nieuw Contract", [
    { id: "clientId", label: "Klant", type: "select", options: clients.map(c => c.name) },
    { id: "typeService", label: "Type service", type: "multiselect", options: settings.typeServices },
    { id: "frequency", label: "Frequentie", type: "select", options: settings.frequencies },
    { id: "priceEx", label: "Prijs excl. (€)" },
    { id: "vatPct", label: "BTW (%)", type: "number", value: 21, disabled: true },
    { id: "lastVisit", label: "Laatste bezoek", type: "date" },
    { id: "maandelijkse_facturatie", label: "Maandelijkse Facturatie", type: "select", options: ["Ja", "Nee"], value: "Nee" },
    { id: "invoice_day", label: "Dag van facturatie (1–31)", type: "number", min: 1, max: 31, value: "" },
  ], async (vals) => {
    try {
      const client = clients.find(c => c.name === vals.clientId);
      if (!client) {
        showToast("Selecteer een bestaande klant", "error");
        return;
      }
      // ✅ Converteer Ja/Nee naar true/false
      if (vals.maandelijkse_facturatie === "Ja") vals.maandelijkse_facturatie = true;
      if (vals.maandelijkse_facturatie === "Nee") vals.maandelijkse_facturatie = false;
      
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vals, clientId: client.id }),
      });

      if (!res.ok) {
        showToast("Fout bij opslaan contract", "error");
        return;
      }

      const contract = await res.json();
      contracts.unshift(contract);
      showToast("Contract toegevoegd", "success");
      await renderContracts();
    } catch (err) {
      console.error("❌ Fout bij opslaan contract:", err);
      showToast("Onverwachte fout bij opslaan contract", "error");
    }
  });

  // --- Dynamisch tonen/verbergen facturatiedag ---
  setTimeout(() => {
    const modal = document.querySelector(".modal-card");
    if (!modal) return;

    const factSelect = modal.querySelector('[name="maandelijkse_facturatie"]');
    const dayField = modal.querySelector('[name="invoice_day"]');
    if (!factSelect || !dayField) return;

    function toggleInvoiceDay() {
      if (factSelect.value === "Ja") {
        dayField.closest(".form-field").style.display = "block";
        dayField.required = true;
      } else {
        dayField.closest(".form-field").style.display = "none";
        dayField.required = false;
        dayField.value = "";
      }
    }

    toggleInvoiceDay();
    factSelect.addEventListener("change", toggleInvoiceDay);
  }, 50);
}
  } catch (err) {
    console.error("❌ Fout bij laden contracten:", err);
    list.innerHTML = `<p class="text-red-500">Fout bij laden contracten.</p>`;
  }
}
// ---------- 📄 Contract Detail ----------
function openContractDetail(c) {
  if (!c) return showToast("Ongeldig contractrecord", "error");

  openModal(`Contract – ${c.client_name || "Onbekende klant"}`, [
    { id: "id", label: "Contract ID", value: c.id, readonly: true },
    { id: "client_name", label: "Klant", value: c.client_name || "-", readonly: true },
    { id: "typeService", label: "Type Service", type: "multiselect", options: settings.typeServices, value: c.type_service },
    { id: "frequency", label: "Frequentie", type: "select", options: settings.frequencies, value: c.frequency },
    { id: "priceInc", label: "Prijs (incl.)", value: c.price_inc ? `€${Number(c.price_inc).toFixed(2)}` : "€0.00" },
    { id: "vat_pct", label: "BTW (%)", value: "21%", readonly: true },
    { id: "last_visit", label: "Laatste bezoek", value: c.last_visit ? c.last_visit.split("T")[0] : "-", readonly: true },
    { id: "next_visit", label: "Volgende bezoek", value: c.next_visit ? c.next_visit.split("T")[0] : "-", readonly: true },
    { id: "maandelijkse_facturatie", label: "Maandelijkse facturatie", type: "select", options: ["Ja", "Nee"], value: c.maandelijkse_facturatie ? "Ja" : "Nee"},
    { id: "invoice_day", label: "Dag van facturatie (1–31)", type: "number", min: 1, max: 31, value: c.invoice_day || "" },
  ], async (vals) => {
    try {
      if (vals.maandelijkse_facturatie === "Ja") vals.maandelijkse_facturatie = true;
      if (vals.maandelijkse_facturatie === "Nee") vals.maandelijkse_facturatie = false;
      const res = await fetch(`/api/contracts/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      if (!res.ok) return showToast("Fout bij opslaan contract", "error");

      const updated = await res.json();
      Object.assign(c, updated);
      showToast("Contract opgeslagen", "success");
      renderContracts();
    } catch (err) {
      console.error("❌ Fout bij opslaan contract:", err);
      showToast("Opslaan mislukt", "error");
    }
  }); // ✅ sluit openModal correct af

  // --- Dynamisch tonen/verbergen facturatiedag ---
  setTimeout(() => {
    const modal = document.querySelector(".modal-card");
    if (!modal) return;

    const factSelect = modal.querySelector('[name="maandelijkse_facturatie"]');
    const dayField = modal.querySelector('[name="invoice_day"]');
    if (!factSelect || !dayField) return;

    function toggleInvoiceDay() {
      if (factSelect.value === "Ja") {
        dayField.closest(".form-field").style.display = "block";
        dayField.required = true;
      } else {
        dayField.closest(".form-field").style.display = "none";
        dayField.required = false;
        dayField.value = "";
      }
    }

    toggleInvoiceDay();
    factSelect.addEventListener("change", toggleInvoiceDay);
  }, 50);
}


// ---------- Nieuw planning item: keuze ----------
function choosePlanningType() {
  openModal("Nieuw Planning-item", [
    {
      id: "choice",
      label: "Kies type planning",
      type: "select",
      options: ["Ad-hoc planning", "Planning updaten volgens frequentie"],
      value: "Ad-hoc planning"
    }
  ], async (vals) => {
    if (vals.choice === "Ad-hoc planning") {
      openNewPlanningModal();
    } else {
      openFrequencyPlanningModal();
    }
  });

  // dynamische knoptekst
  setTimeout(() => {
    const card = document.querySelector(".modal-card");
    const saveBtn = card?.querySelector("#save");
    const select = card?.querySelector("select[name='choice']");
    if (!saveBtn || !select) return;
    const updateLabel = () => {
      saveBtn.textContent =
        select.value === "Ad-hoc planning" ? "Creëren" : "Updaten";
    };
    updateLabel();
    select.addEventListener("change", updateLabel);
  }, 0);
}

// ---------- Nieuw planning-item ----------
async function openNewPlanningModal() {
  // contracts ophalen
  let allContracts = [];
  try {
    const res = await fetch("/api/contracts");
    if (res.ok) allContracts = await res.json();
  } catch {
    showToast("Fout bij laden contracten", "error");
    return;
  }

  let selectedContractId = null;

  openModal("Nieuw Planning-item", [
    {
      id: "contractSearch",
      label: "Klant / Adres",
      type: "custom",
      render: () => `
        <div class="relative">
          <input id="contractSearchInput" name="contractSearch" type="text"
            placeholder="Typ klantnaam of adres..."
            class="w-full border rounded px-2 py-1 mb-1
                   bg-white text-gray-800
                   dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
          <div id="contractSearchList"
               class="hidden max-h-40 overflow-y-auto border rounded absolute z-50 w-full
                      bg-white dark:bg-gray-800 dark:border-gray-600"></div>
        </div>`
    },
    { id: "date", label: "Datum", type: "date", value: new Date().toISOString().split("T")[0] },
    { id: "memberId", label: "Toegewezen medewerker", type: "select", options: members.map(m => m.name) },
    { id: "status", label: "Status", type: "select", options: ["Gepland","In uitvoering","Afgerond","Geannuleerd"], value: "Gepland" },
    { id: "comment", label: "Opmerking", type: "textarea" }
  ], async (vals) => {
    if (!selectedContractId) return showToast("Selecteer eerst een geldig contract", "error");
    if (!vals.date) return showToast("Datum is verplicht", "error");

    const memberObj = members.find(m => m.name === vals.memberId);
    const memberId = memberObj ? memberObj.id : null;

    try {
      const res = await fetch("/api/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: selectedContractId,
          memberId,
          date: vals.date,
          status: vals.status,
          comment: vals.comment
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(`Fout bij opslaan: ${err.error || res.statusText}`, "error");
        return;
      }

      await res.json();
      showToast("Planning-item toegevoegd", "success");
      await loadPlanningData();
    } catch (err) {
      console.error("❌ Fout bij opslaan planning:", err);
      showToast("Onverwachte fout bij opslaan planning", "error");
    }
  });

  // autocomplete
  setTimeout(() => {
    const modal = document.querySelector(".modal-card");
    if (!modal) return;

    const input = modal.querySelector("#contractSearchInput");
    const list = modal.querySelector("#contractSearchList");
    if (!input || !list) return;

    input.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });

    const renderMatches = (matches) => {
      if (!matches.length) {
        list.innerHTML = `<div class="p-2 text-gray-500">Geen resultaten</div>`;
        list.classList.remove("hidden");
        return;
      }
      list.innerHTML = matches.map(c => `
        <div class="p-2 hover:bg-blue-100 dark:hover:bg-gray-700 cursor-pointer" data-id="${c.id}">
          <strong>${c.client_name || "Onbekend"}</strong> – ${c.description || "-"}<br>
          <small class="text-gray-500">${c.address || ""} ${c.house_number || ""}, ${c.city || ""}</small>
        </div>`).join("");
      list.classList.remove("hidden");

      list.querySelectorAll("[data-id]").forEach(el => {
        el.addEventListener("click", () => {
          selectedContractId = el.dataset.id;
          input.value = el.textContent.trim();
          list.classList.add("hidden");
        });
      });
    };

    input.addEventListener("input", e => {
      const q = e.target.value.toLowerCase().trim();
      if (q.length < 2) return list.classList.add("hidden");
      const matches = allContracts.filter(c =>
        (c.client_name || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q)
      ).slice(0, 12);
      renderMatches(matches);
    });

    document.addEventListener("click", e => {
      if (!list.contains(e.target) && e.target !== input) list.classList.add("hidden");
    });
  }, 50);
}

// ---------- Planning updaten volgens frequentie ----------
async function openFrequencyPlanningModal() {
  let allContracts = [];
  try {
    const res = await fetch("/api/contracts");
    if (res.ok) allContracts = await res.json();
  } catch {
    showToast("Fout bij laden contracten", "error");
    return;
  }

  let selectedContractId = null;

  openModal("Planning updaten volgens frequentie", [
    {
      id: "contractSearch",
      label: "Klant / Adres",
      type: "custom",
      render: () => `
        <div class="relative">
          <input id="freqContractSearchInput" name="contractSearch" type="text"
            placeholder="Typ klantnaam of adres..."
            class="w-full border rounded px-2 py-1 mb-1
                   bg-white text-gray-800
                   dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
          <div id="freqContractSearchList"
               class="hidden max-h-40 overflow-y-auto border rounded absolute z-50 w-full
                      bg-white dark:bg-gray-800 dark:border-gray-600"></div>
        </div>`
    },
    { id: "memberId", label: "Toegewezen medewerker", type: "select", options: (members||[]).map(m => m.name) },
    { id: "startDate", label: "Nieuwe startdatum", type: "date", value: new Date().toISOString().split("T")[0] }
  ], async (vals) => {
    if (!selectedContractId)
      return showToast("Selecteer eerst een geldig contract", "error");
    if (!vals.startDate)
      return showToast("Startdatum is verplicht", "error");

    const memberObj = (members||[]).find(m => m.name === vals.memberId);
    const memberId  = memberObj ? memberObj.id : null;

    try {
      // ✅ Nieuwe startdatum meesturen naar backend
      const res = await fetch(`/api/planning/rebuild/${selectedContractId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: vals.startDate,
          memberId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Fout bij herplannen reeks", "error");
        return;
      }

      showToast(
        `Reeks opnieuw aangemaakt vanaf ${vals.startDate} (${data.count || 0} items)`,
        "success"
      );
      await loadPlanningData();
    } catch (err) {
      console.error("❌ Fout bij herplannen reeks:", err);
      showToast("Onverwachte fout bij herplannen reeks", "error");
    }
  });

  // Zet knoptekst op “Updaten”
  setTimeout(() => {
    const card = document.querySelector(".modal-card");
    const saveBtn = card?.querySelector("#save");
    if (saveBtn) saveBtn.textContent = "Updaten";
  }, 0);

  // Autocomplete functionaliteit
  setTimeout(() => {
    const modal = document.querySelector(".modal-card");
    if (!modal) return;
    const input = modal.querySelector("#freqContractSearchInput");
    const list  = modal.querySelector("#freqContractSearchList");
    if (!input || !list) return;

    input.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });

    const renderMatches = (matches) => {
      if (!matches.length) {
        list.innerHTML = `<div class="p-2 text-gray-500">Geen resultaten</div>`;
        list.classList.remove("hidden");
        return;
      }
      list.innerHTML = matches.map(c => `
        <div class="p-2 hover:bg-blue-100 dark:hover:bg-gray-700 cursor-pointer" data-id="${c.id}">
          <strong>${c.client_name || "Onbekend"}</strong> – ${c.description || "-"}<br>
          <small class="text-gray-500">${c.address || ""} ${c.house_number || ""}, ${c.city || ""}</small>
        </div>`).join("");
      list.classList.remove("hidden");

      list.querySelectorAll("[data-id]").forEach(el => {
        el.addEventListener("click", () => {
          selectedContractId = el.dataset.id;
          input.value = el.textContent.trim();
          list.classList.add("hidden");
        });
      });
    };

    input.addEventListener("input", e => {
      const q = e.target.value.toLowerCase().trim();
      if (q.length < 2) return list.classList.add("hidden");
      const matches = allContracts.filter(c =>
        (c.client_name || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q)
      ).slice(0, 12);
      renderMatches(matches);
    });

    document.addEventListener("click", e => {
      if (!list.contains(e.target) && e.target !== input) list.classList.add("hidden");
    });
  }, 50);
}





// ---------- Automatische generatie ----------
async function generatePlanning() {
  showToast("Planning wordt gegenereerd...", "info");
  const r = await fetch("/api/planning/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: new Date().toISOString().split("T")[0] })
  });
  const d = await r.json();
  if (r.ok) {
    showToast(`Planning gegenereerd (${d.generated} taken)`, "success");
    loadPlanningData();
  } else showToast(d.error || "Fout bij genereren", "error");
}

// ---------- Data opnieuw laden ----------
async function loadPlanningData() {
  console.log("🔍 loadPlanningData triggered:", document.getElementById("planningFilter")?.value);
  
  const filter = document.getElementById("planningFilter")?.value || "all";
  const dateInput = document.getElementById("customDate");
  const tbl = document.getElementById("planningTable");

  if (filter === "date") {
    dateInput.classList.remove("hidden");
    if (!dateInput.value) {
      planning = [];
      tbl.innerHTML = `
        <div class="text-gray-500 dark:text-gray-400 p-3 text-center">
          Kies eerst een datum om planning te laden.
        </div>`;
      return;
    }
  } else {
    dateInput.classList.add("hidden");
  }

  const memberId = document.getElementById("memberFilter")?.value || "";
  const status = document.getElementById("statusFilter")?.value || "";

 const url = new URL("/api/planning/schedule", window.location.origin);

// map FE filter naar backend labels
let rangeValue = filter;

if (filter === "date") {
  rangeValue = "specifieke datum";
}

url.searchParams.set("range", rangeValue);

if (memberId) url.searchParams.set("memberId", memberId);
if (status) url.searchParams.set("status", status);

// bij specifieke datum altijd start waarde meesturen
if (rangeValue === "specifieke datum" && dateInput.value) {
  url.searchParams.set("start", dateInput.value); // yyyy-mm-dd
}

  // 👇 nieuwe toevoeging
const weekNumber = document.getElementById("filterWeek")?.value;
if (weekNumber) url.searchParams.set("week", weekNumber);

  const res = await fetch(url);
  if (!res.ok) {
    showToast("Fout bij laden planning", "error");
    return;
  }

  const data = await res.json();
  planning = data.items || [];

  // ✅ Zoekfilter toepassen
const searchTerm = document.getElementById("planningSearch")?.value?.toLowerCase().trim();
let filtered = planning;
if (searchTerm) {
  filtered = planning.filter(p =>
    [p.customer, p.address, p.city, p.member_name, p.comment, p.status]
      .filter(Boolean)
      .some(val => val.toLowerCase().includes(searchTerm))
  );
}


  const rows = filtered.map(p => [
    `${p.address || ""} ${p.house_number || ""}, ${p.city || ""}`,
    p.customer || "-",
    p.date ? p.date.split("T")[0] : "-",
    p.week_number || "-",
    p.member_name || "-",
    p.comment || "-",
    p.status || "Gepland",
    p.cancel_reason || "-"
  ]);

  tbl.innerHTML = tableHTML(
    ["Adres", "Klant", "Datum", "Week", "Member", "Opmerking", "Status", "Reden Geannuleerd"],
    rows
  );

  tbl.querySelectorAll("tbody tr").forEach((tr, i) =>
    tr.addEventListener("click", () => openPlanningDetail(planning[i]))
  );

  //document.getElementById("planningFilter").onchange = loadPlanningData;
  //document.getElementById("memberFilter").onchange = loadPlanningData;
  //document.getElementById("customDate").onchange = loadPlanningData;
  //document.getElementById("statusFilter").onchange = loadPlanningData;

    // 👇 Toevoegen zodat Enter of wijziging van weeknummer filter werkt
  const weekInput = document.getElementById("filterWeek");
  if (weekInput) {
    weekInput.addEventListener("keydown", e => {
      if (e.key === "Enter") loadPlanningData(); // Enter = herladen
    });
    weekInput.addEventListener("change", loadPlanningData); // wijziging = herladen
  }

  // ✅ Veiligheid: functies checken
  const genBtn = document.getElementById("generatePlanningBtn");
  if (genBtn && typeof generatePlanning === "function") genBtn.onclick = generatePlanning;

const newBtn = document.getElementById("newPlanningBtn");
if (newBtn && typeof choosePlanningType === "function") newBtn.onclick = choosePlanningType;
}



// ---------- Detail bewerken ----------
function openPlanningDetail(p) {
  if (!p) {
    showToast("Ongeldig planning item", "error");
    return;
  }

  openModal(`Planning – ${p.customer || "-"}`, [
    { id: "id", label: "Klant ID", value: p.id, readonly: true },
    { id: "address",  label: "Adres",  value: `${p.address || ""} ${p.house_number || ""}, ${p.city || ""}`, readonly: true },
    { id: "customer", label: "Klant",  value: p.customer || "-", readonly: true },
    { id: "date",     label: "Datum",  type: "date", value: p.date ? p.date.split("T")[0] : "" },
    { id: "memberId", label: "Member", type: "select", options: (members || []).map(m => m.name), value: p.member_name || "" },
    { id: "status",   label: "Status", type: "select", options: ["Gepland", "Afgerond", "Geannuleerd"], value: p.status || "Gepland" },
    { id: "comment",  label: "Opmerking", type: "textarea", value: p.comment || "" },
    { id: "invoiced", label: "Gefactureerd", type: "checkbox", value: !!p.invoiced },
    {
      id: "cancel_reason",
      label: "Reden geannuleerd",
      type: "select",
      options: ["Door Ons", "Door Klant", "Contract stop gezet door klant", "Contract stop gezet door ons"],
      value: p.cancel_reason || "",
      hidden: (p.status !== "Geannuleerd")
    }
  ], async vals => {
    try {
      const member = members.find(m => m.name === vals.memberId);
      const payload = {
        memberId: member?.id || null,
        date: vals.date,
        status: vals.status,
        comment: vals.comment || null,
        invoiced: !!vals.invoiced,
      };
      // ✅ alleen meesturen als echt nodig
      if (vals.status === "Geannuleerd") {payload.cancel_reason = vals.cancel_reason || null;
}

      const updateRes = await fetch(`/api/planning/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!updateRes.ok) {
        showToast("Fout bij opslaan planning item", "error");
        return;
      }

      // ✅ Nieuwe annuleerlogica
      if (payload.status === "Geannuleerd") {
        showToast("Afspraak geannuleerd — opmerking doorgeschoven", "info");
        await loadPlanningData();
        return;
      }

      if (payload.status === "Afgerond") {
        showToast("Afspraak afgerond — contract bijgewerkt", "info");
      }

      await loadPlanningData();
    } catch (err) {
      console.error("❌ Fout bij opslaan planning item:", err);
      showToast("Onverwachte fout bij opslaan planning item", "error");
    }
  });


  // 🔹 Dynamisch tonen/verbergen van "Reden geannuleerd"
  setTimeout(() => {
    const statusSel = document.querySelector("select[name='status']");
    const reasonField = document.querySelector("[name='cancel_reason']")?.closest(".form-field");
    if (statusSel && reasonField) {
      const toggleReason = () => {
        reasonField.style.display = statusSel.value === "Geannuleerd" ? "block" : "none";
      };
      toggleReason();
      statusSel.addEventListener("change", toggleReason);
    }
  }, 0);
}

// ---------- Hoofd-render ----------
async function renderPlanning() {
  const list = document.getElementById("planningList");

  // ✅ Members ophalen indien nog niet geladen
  if (!Array.isArray(members) || !members.length) {
    const mRes = await fetch("/api/members");
    if (mRes.ok) members = await mRes.json();
  }

  // ✅ Eerste basis-load (alles)
  const range = "all";
  const url = new URL("/api/planning/schedule", window.location.origin);
  url.searchParams.set("range", range);

  const res = await fetch(url);
  if (!res.ok) {
    showToast("Fout bij laden planning", "error");
    return;
  }

  planning = (await res.json()).items || [];

  // ---------- Filters + knoppen ----------
  const controlsHTML = `
  <div class="flex justify-between mb-2 flex-wrap gap-2 items-center">
    <h2 class="text-xl font-semibold">Planning</h2>
    <div class="flex flex-wrap gap-2 items-center justify-end w-full md:w-auto">
      <select id="planningFilter"
              class="border rounded px-2 py-1 bg-white text-gray-800
                     dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
        <option value="today">Vandaag</option>
        <option value="tomorrow">Morgen</option>
        <option value="week">Deze week</option>
        <option value="month">Deze maand</option>
        <option value="year">Dit jaar</option>
        <option value="date">Specifieke datum…</option>
        <option value="all" selected>Alles</option>
      </select>

      <input id="filterWeek" type="number" min="1" max="53" placeholder="Week #"
             class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700" />

      <input id="customDate" type="date"
             class="hidden border rounded px-2 py-1 bg-white text-gray-800
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"/>

      <select id="memberFilter"
              class="border rounded px-2 py-1 bg-white text-gray-800
                     dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
        <option value="">Alle Members</option>
        ${members.map(m => `<option value="${m.id}">${m.name}</option>`).join("")}
      </select>

      <select id="statusFilter"
              class="border rounded px-2 py-1 bg-white text-gray-800
                     dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600">
        <option value="">Alle Statussen</option>
        <option value="Gepland">Gepland</option>
        <option value="Afgerond">Afgerond</option>
        <option value="Geannuleerd">Geannuleerd</option>
      </select>

      <!-- 🔍 Zoekveld naar rechts -->
      <input id="planningSearch" type="text"
             placeholder="Zoek klant, adres, member..."
             class="border rounded px-2 py-1 w-64 text-sm bg-white text-gray-800
                    dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600" />
      <button id="newPlanningBtn"
              class="bg-primary text-white px-3 py-2 rounded hover:bg-blue-700">
        + Nieuw Item
      </button>
<button id="sharePlanningBtn"
              class="bg-primary text-white px-3 py-2 rounded hover:bg-blue-700">
        📤 Deel planning
      </button>
      <button id="bulkUpdateBtn" class="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700">
  Bulk Update
</button>
    </div>
  </div>
  <div id="planningTable"></div>`;

  

  list.innerHTML = controlsHTML;

  // ✅ Eén enkele load (geen dubbele meer)
  await loadPlanningData();

  // ✅ Filters activeren – blijven actief zolang tab open blijft
  const filterIds = ["planningFilter", "memberFilter", "statusFilter", "customDate", "filterWeek"];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === "filterWeek") {
      el.addEventListener("keydown", e => { if (e.key === "Enter") loadPlanningData(); });
      el.addEventListener("change", loadPlanningData);
    } else {
      el.addEventListener("change", loadPlanningData);
    }
  });

  // ✅ Toon/verberg datumveld bij “Specifieke datum”
  const planningFilter = document.getElementById("planningFilter");
  const customDate = document.getElementById("customDate");
  if (planningFilter && customDate) {
    const toggleDate = () => {
      customDate.classList.toggle("hidden", planningFilter.value !== "date");
    };
    planningFilter.addEventListener("change", toggleDate);
    toggleDate(); // direct uitvoeren
  }

  // ✅ Deel planning knop activeren
  const shareBtn = document.getElementById("sharePlanningBtn");
  if (shareBtn) {
    shareBtn.onclick = async () => {
      openModal("Deel Planning", [
        { id: "periode", label: "Selecteer periode", type: "select", options: ["Voor Morgen", "Deze Week", "Deze Maand"] }
      ], async (vals) => {
        showToast(`Planning wordt gedeeld (${vals.periode})`, "info");

        const res = await fetch("/api/planning/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periode: vals.periode })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(`Planning gedeeld met ${data.sentCount} members`, "success");
        } else {
          showToast(data.error || "Fout bij delen planning", "error");
        }
      });

      setTimeout(() => {
        const modal = document.querySelector(".modal-card");
        const saveBtn = modal?.querySelector("#save");
        if (saveBtn) saveBtn.textContent = "Delen";
      }, 0);
    };
  }
// ---------- 🔥 Bulk Update Planning Status ----------
document.getElementById("bulkUpdateBtn").onclick = async () => {
  openModal("Bulk Update – Planningen Afgerond Markeren", [
    {
      id: "periode",
      label: "Periode",
      type: "select",
      options: ["Vandaag", "Morgen", "Deze week", "Deze maand"]
    }
  ], async (vals) => {

    // 🕒 Vandaag = NL datum, geen UTC
function toNLDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;   // YYYY-MM-DD
}

const today = new Date();
let startDate, endDate;

switch (vals.periode) {

  case "Vandaag":
    startDate = endDate = toNLDate(today);
    break;

  case "Morgen":
    const tm = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    startDate = endDate = toNLDate(tm);
    break;

  case "Deze week":
    // dagnummer (0=zo → 7, 1=ma etc)
    const day = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day - 1));

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    startDate = toNLDate(monday);
    endDate = toNLDate(friday);
    break;

  case "Deze maand":
    const y = today.getFullYear();
    const m = today.getMonth();

    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);

    startDate = toNLDate(first);
    endDate = toNLDate(last);
    break;

  default:
    showToast("Ongeldige periode", "error");
    return;
}


    // 🧩 Planning preview ophalen
    const previewRes = await fetch(`/api/planning/period-preview/bulk?startDate=${startDate}&endDate=${endDate}`);
    const previewData = await previewRes.json();

    if (!previewRes.ok || !Array.isArray(previewData) || !previewData.length) {
      showToast(previewData.error || "Geen planningen gevonden", "warning");
      return;
    }

    // 🧾 Checkboxes opbouwen
    const checkboxes = previewData.map(p => ({
      id: p.id,
      label: `${p.client_name} – ${p.description} (€${p.price_inc}) op ${p.date.split("T")[0]}`
    }));


    // 🧾 HTML voor checkboxlijst
const modalContentHTML = `
  <p class="mb-3 text-gray-700 dark:text-gray-300">
    Selecteer welke planningen je wilt markeren als afgerond (${startDate} t/m ${endDate}):
  </p>

  <div class="max-h-64 overflow-y-auto border p-2 rounded space-y-1 dark:border-gray-700">
    ${checkboxes.map(c =>
      `<label class="flex items-center gap-2">
         <input type="checkbox" class="chkPlanning" value="${c.id}" checked>
         <span>${c.label}</span>
       </label>`
    ).join("")}
  </div>

  <div class="flex justify-end gap-2 mt-4">
    <button id="cancelBulkBtn" class="btn btn-secondary">Annuleren</button>
    <button id="confirmBulkBtn" class="btn btn-ok">Status Afgerond</button>
  </div>
`;

// ✔ overlay (donkere achtergrond)
const overlay = document.createElement("div");
overlay.className = "modal-overlay";

// ✔ modal-card (zelfde styling als openModal())
const card = document.createElement("div");
card.className = "modal-card";
card.innerHTML = modalContentHTML;

overlay.appendChild(card);
document.body.appendChild(overlay);

// ❌ Annuleren
document.getElementById("cancelBulkBtn").onclick = () => overlay.remove();

// ✅ Confirm
document.getElementById("confirmBulkBtn").onclick = async () => {
  const selectedIds = [...card.querySelectorAll(".chkPlanning:checked")].map(i => i.value);

  if (!selectedIds.length) {
    showToast("Geen planningen geselecteerd", "warning");
    return;
  }

  showToast(`Bijwerken van ${selectedIds.length} planningen gestart...`, "info");

  const res = await fetch("/api/planning/bulk-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedIds })
  });

  const data = await res.json();
  overlay.remove();

  if (res.ok) {
    showToast(`${data.updated} planningen bijgewerkt`, "success");
    await loadTab("planning");
  } else {
    showToast(data.error || "Fout bij bulk update", "error");
  }
};

  });
};



  // ✅ Buttons koppelen (veiligheid)
  const genBtn = document.getElementById("generatePlanningBtn");
  if (genBtn && typeof generatePlanning === "function")
    genBtn.onclick = generatePlanning;

  const newBtn = document.getElementById("newPlanningBtn");
  if (newBtn && typeof choosePlanningType === "function")
    newBtn.onclick = choosePlanningType;
}


// ---------- 💰 Facturen ----------
async function renderInvoices() {
  const list = document.getElementById("invoicesList");
// ✅ Tags ophalen als ze nog niet in geheugen staan
if (!Array.isArray(tags) || !tags.length) {
  try {
    const tRes = await fetch("/api/tags");
    if (tRes.ok) {
      tags = await tRes.json();
    } else {
      tags = [];
      console.warn("⚠️ Geen tags ontvangen van server.");
    }
  } catch (err) {
    console.error("⚠️ Fout bij ophalen tags:", err.message);
    tags = [];
  }
}

  try {
    const res = await fetch("/api/invoices");
    if (!res.ok) throw new Error("Fout bij ophalen facturen");
    invoices = await res.json();

    // 🔥 Dynamische methodes laden
const mRes = await fetch("/api/invoices/methods");
let methods = [];
if (mRes.ok) methods = await mRes.json();

    // 🔹 Header + filters + acties
    list.innerHTML = `
      <div class="flex flex-wrap justify-between items-center mb-2 gap-2">
        <h2 class="text-xl font-semibold">Facturen</h2>

        <div class="flex flex-wrap items-center gap-2 justify-end">
         <input id="invoiceSearchInvoices" type="text" placeholder="Zoek..."
  class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700" />

<select id="filterPeriodInvoices" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
  <option value="">Periode</option>
  <option value="vandaag">Vandaag</option>
  <option value="deze_week">Deze week</option>
  <option value="deze_maand">Deze maand</option>
</select>

<select id="filterMethodInvoices" class="border rounded px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-700">
  <option value="">Methode</option>
  ${methods
    .filter(m => m && m.trim() !== "")
    .map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`)
    .join("")}
</select>

          <button id="manualInvoiceBtn" class="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700">🧾 Factureer een klant</button>
          <button id="tagInvoiceBtn" class="bg-indigo-600 text-white px-3 py-2 rounded hover:bg-indigo-700">🏷️ Bulk per Tag</button>
          <button id="periodInvoiceBtn" class="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700">📅 Bulk per Periode</button>
        </div>
      </div>

      <div class="overflow-y-auto max-h-[70vh] relative" id="invoicesTable"></div>
    `;


    const tableContainer = document.getElementById("invoicesTable");

 function renderFiltered() {

  const s = (document.querySelector("#invoiceSearchInvoices")?.value || "").toLowerCase();
const p = (document.querySelector("#filterPeriodInvoices")?.value || "").toLowerCase();
const m = (document.querySelector("#filterMethodInvoices")?.value || "").toLowerCase();



  const filtered = invoices.map(inv => {
    // Auto-fix NULL method → “maandelijks”
    inv.method = (inv.method || "maandelijks").toLowerCase();
    return inv;
  }).filter(inv => {

    // Database method is altijd lowercase nu
    const invMethod = inv.method;

    // Search filter
    const matchesSearch =
      !s || Object.values(inv).join(" ").toLowerCase().includes(s);

    // Method filter
    const matchesMethod =
      !m || invMethod === m;

    // Period filter
    const matchesPeriod =
      !p ||
      (p === "vandaag" &&
        inv.created_at?.startsWith(new Date().toISOString().split("T")[0])) ||
      (p === "deze_week" &&
        new Date(inv.created_at) >= getStartOfWeek()) ||
      (p === "deze_maand" &&
        new Date(inv.created_at).getMonth() === new Date().getMonth());

    return matchesSearch && matchesMethod && matchesPeriod;
  });




      const rows = filtered.map(i => [
  i.client_name || "-",
  i.planning_id ? i.planning_id.slice(0, 8) + "…" : "-",
  i.amount ? `€${Number(i.amount).toFixed(2)}` : "€0.00",
  i.date ? i.date.split("T")[0] : (i.created_at ? i.created_at.split("T")[0] : "-"),
  i.method || "-",
  i.status || "-",          // 👉 Toor Status
 // i.yuki_status || "-"      // 👉 Yuki Status
  
]);

tableContainer.innerHTML = tableHTML(
  ["Klant", "Planning", "Bedrag", "Datum", "Methode", "Toor Status"],
  rows

);
// ✅ Klikbare rijen om details te openen
tableContainer.querySelectorAll("tbody tr").forEach((tr, i) => {
  tr.addEventListener("click", () => openInvoiceDetail(filtered[i]));
});

    }

 document.getElementById("invoiceSearchInvoices").addEventListener("input", renderFiltered);

// ✅ Zorg dat de juiste ID-naam overeenkomt met je HTML
["filterPeriodInvoices", "filterMethodInvoices", "invoiceSearchInvoices"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", renderFiltered);
});


    renderFiltered();

// ---------- 🧾 Factureer een klant ----------
document.getElementById("manualInvoiceBtn").onclick = async () => {
  // Fase 1: zoekterm vragen via openModal (jouw bestaande UX)
  openModal("Factureer een klant", [
    {
      id: "search",
      label: "Zoek planning (klantnaam, adres of datum)",
      type: "text",
      placeholder: "Bijv. Jansen, Dordrecht, 2025-11-10",
    },
  ], async (vals) => {
    if (!vals.search) {
      showToast("Zoekterm is verplicht", "warning");
      return;
    }

    // 1) Planning zoeken (met cache-buster)
    const searchRes = await fetch(`/api/planning/search?term=${encodeURIComponent(vals.search)}&_=${Date.now()}`);
    let results = [];
    try { results = await searchRes.json(); } catch { results = []; }

    if (!searchRes.ok || !Array.isArray(results) || !results.length) {
      showToast((results && results.error) || "Geen planning gevonden", "warning");
      return;
    }

    // Fase 2: eigen overlay (zoals bij jouw tag-bulk) met selectie + velden + verzendknop
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const card = document.createElement("div");
    card.className = "modal-card";
    card.style.width = "560px"; // iets ruimer
    card.innerHTML = `
      <h3 class="text-lg font-semibold mb-3">Selecteer planning & vul gegevens</h3>

      <div class="form-field">
        <label>Kies planningrecord</label>
        <select id="planningSelect" class="input border rounded w-full px-2 py-1">
          ${results.map(p =>
            `<option value="${p.id}">
              ${p.client_name} – ${(p.address || "")} (${(p.date || "").split("T")[0] || ""})
            </option>`
          ).join("")}
        </select>
      </div>

      <div class="form-field mt-3">
        <label>Bedrag (€)</label>
        <input id="amount" type="number" step="0.01" class="input border rounded w-full px-2 py-1" />
      </div>

      <div class="form-field mt-3">
        <label>Type Service(s)</label>
        <select id="type_service" multiple class="input border rounded w-full px-2 py-1">
          <option disabled>Services laden...</option>
        </select>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button id="cancelManualInvoiceBtn" class="btn btn-secondary">Annuleren</button>
        <button id="sendManualInvoiceBtn" class="btn btn-ok">Verzenden</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Hulpfuncties / refs
    const planningSelect = card.querySelector("#planningSelect");
    const amountInput    = card.querySelector("#amount");
    const typeSelect     = card.querySelector("#type_service");
    const btnCancel      = card.querySelector("#cancelManualInvoiceBtn");
    const btnSend        = card.querySelector("#sendManualInvoiceBtn");

    // 2) Contract + services laden voor de (initiële) selectie
  async function loadContractServices(planningId) {
  if (!planningId) return;
  try {
    const contractRes = await fetch(`/api/contracts/by-planning/${planningId}?_=${Date.now()}`);
    const contract = await contractRes.json();

    if (!contractRes.ok) {
      typeSelect.innerHTML = `<option disabled>Geen type services gevonden</option>`;
      showToast("Fout bij ophalen contract", "error");
      return null;
    }

    // 🔸 Altijd ALLE services tonen (niet alleen van contract)
    const allServices = settings.typeServices || [];
    const selected = Array.isArray(contract.type_service)
      ? contract.type_service
      : (typeof contract.type_service === "string" && contract.type_service.trim() !== "")
        ? [contract.type_service]
        : [];

    typeSelect.innerHTML = allServices
      .map(ts => `<option value="${ts}" ${selected.includes(ts) ? "selected" : ""}>${ts}</option>`)
      .join("");

    return contract;
  } catch (e) {
    typeSelect.innerHTML = `<option disabled>Services laden mislukt</option>`;
    showToast("Services laden mislukt", "error");
    return null;
  }
}


    // init load voor eerste optie
    let currentContract = await loadContractServices(planningSelect.value);

    // wisselen van planning
    planningSelect.addEventListener("change", async () => {
      currentContract = await loadContractServices(planningSelect.value);
    });

    // Annuleren
    btnCancel.onclick = () => overlay.remove();

    // Verzenden
    btnSend.onclick = async () => {
      const planningId = planningSelect.value;
      if (!planningId) return showToast("Selecteer een planningrecord", "warning");

      const amountVal = parseFloat(amountInput.value || "0");
      if (!amountVal || isNaN(amountVal) || amountVal <= 0) {
        return showToast("Voer een geldig bedrag in", "warning");
      }

      // Als om wat voor reden currentContract nog leeg is: fallback ophalen
      if (!currentContract) {
        const fallbackRes = await fetch(`/api/contracts/by-planning/${planningId}?_=${Date.now()}`);
        currentContract = await fallbackRes.json();
        if (!fallbackRes.ok) return showToast("Fout bij ophalen contract", "error");
      }

      const selectedTypes = Array.from(typeSelect.selectedOptions).map(o => o.value);

      const body = {
        clientId:   currentContract.client_id,
        contractId: currentContract.id,
        planningId,
        amount:     amountVal,
        typeServices: selectedTypes || [],
      };

      try {
        const res  = await fetch("/api/invoices-yuki/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (res.ok) {
          showToast("Factuur verzonden naar Yuki", "success");
          overlay.remove();
          await renderInvoices?.();
        } else {
          showToast(data.error || "Fout bij aanmaken factuur", "error");
        }
      } catch (e) {
        showToast("Onverwachte fout bij aanmaken factuur", "error");
      }
    };
  });

  // ❌ Belangrijk: GEEN setTimeout meer dat de save-knop terugzet naar 'Opslaan'
  // (Dat veroorzaakte dat de openModal-logica jouw eigen flow overschreef)
};
function renderStatusBadge(status) {
  const color =
    status === "Betaald" ? "bg-green-100 text-green-700" :
    status === "Fout" ? "bg-red-100 text-red-700" :
    status === "Verzonden" ? "bg-blue-100 text-blue-700" :
    "bg-gray-100 text-gray-700";

  return `<span class="px-2 py-1 rounded text-xs font-medium ${color}">
            ${status || "-"}
          </span>`;
}

    // ---------- 📅 Bulk Facturatie per Periode ----------
document.getElementById("periodInvoiceBtn").onclick = async () => {
  openModal("Bulk Facturatie per Periode", [
    { id: "periode", label: "Periode", type: "select", options: ["Vandaag", "Deze week", "Deze maand"] },
  ], async (vals) => {
    // 🧮 Bereken start- en einddatum
    const today = new Date();
    let startDate, endDate;

    switch (vals.periode) {
      case "Vandaag":
        startDate = endDate = today.toISOString().split("T")[0];
        break;
      case "Deze week":
        const day = today.getDay();
        const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diffToMonday));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        startDate = monday.toISOString().split("T")[0];
        endDate = sunday.toISOString().split("T")[0];
        break;
      case "Deze maand":
        const y = today.getFullYear();
        const m = today.getMonth();
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        startDate = first.toISOString().split("T")[0];
        endDate = last.toISOString().split("T")[0];
        break;
      default:
        showToast("Ongeldige periode", "error");
        return;
    }

    // 🧩 Haal planningen in deze periode op (preview)
    const previewRes = await fetch(`/api/planning/period-preview/facturatie?startDate=${startDate}&endDate=${endDate}`);
const previewData = await previewRes.json();

if (!previewRes.ok || !Array.isArray(previewData) || !previewData.length) {
  showToast(previewData.error || "Geen planningen gevonden", "warning");
  return;
}

    // 🧾 Bouw tabel met checkboxes
    const checkboxes = previewData.map(p => ({
      id: p.id,
      label: `${p.client_name} – ${p.description} (€${p.price_inc}) op ${p.date.split("T")[0]}`
    }));

    const modalContent = document.createElement("div");
    modalContent.innerHTML = `
      <p class="mb-3 text-gray-700 dark:text-gray-300">Selecteer welke planningen je wilt factureren (${startDate} t/m ${endDate}):</p>
      <div class="max-h-64 overflow-y-auto border p-2 rounded space-y-1 dark:border-gray-700">
        ${checkboxes.map(c =>
          `<label class="flex items-center gap-2">
             <input type="checkbox" class="chkPlanning" value="${c.id}" checked>
             <span>${c.label}</span>
           </label>`
        ).join("")}
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button id="cancelBulkBtn" class="btn btn-secondary">Annuleren</button>
        <button id="confirmBulkBtn" class="btn btn-ok">Verzenden</button>
      </div>
    `;

   // --- Nieuwe uniforme modal --- //
const overlay = document.createElement("div");
overlay.className = "modal-overlay";

const card = document.createElement("div");
card.className = "modal-card";
card.innerHTML = modalContent.innerHTML;  // behoudt de HTML die je eerder bouwde

overlay.appendChild(card);
document.body.appendChild(overlay);

// ❌ Annuleren
card.querySelector("#cancelBulkBtn").onclick = () => overlay.remove();

// ✅ Verzenden
card.querySelector("#confirmBulkBtn").onclick = async () => {
  const selectedIds = [...card.querySelectorAll(".chkPlanning:checked")].map(i => i.value);

  if (!selectedIds.length) {
    showToast("Geen planningen geselecteerd", "warning");
    return;
  }

  showToast(`Versturen van ${selectedIds.length} facturen gestart...`, "info");

  const res = await fetch("/api/invoices-yuki/period", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, selectedIds }),
  });

  const data = await res.json();
  overlay.remove();

  if (res.ok) showToast(data.summary || "Facturatie gestart", "success");
  else showToast(data.error || "Fout bij verzenden", "error");

  await renderInvoices();
};

  });
};


  } catch (err) {
    console.error("❌ Fout bij laden facturen:", err);
    showToast("Fout bij laden facturen", "error");
  }
     // ---------- 🏷️ Bulk Facturatie per Tag ----------
document.getElementById("tagInvoiceBtn").onclick = async () => {
  openModal("Bulk Facturatie per Tag", [
    { id: "tag", label: "Selecteer Tag", type: "select", options: tags.map(t => t.name) }
  ], async (vals) => {
    const tag = vals.tag;
    if (!tag) {
      showToast("Geen tag geselecteerd", "warning");
      return;
    }

    // 🧩 Haal planningen op voor deze tag
    const previewRes = await fetch(`/api/planning/tag-preview?tag=${encodeURIComponent(tag)}`);
    const previewData = await previewRes.json();
    if (!previewRes.ok || !Array.isArray(previewData) || !previewData.length) {
      showToast(previewData.error || "Geen planningen gevonden", "warning");
      return;
    }

    // 🧾 Bouw tabel met checkboxes
    const checkboxes = previewData.map(p => ({
      id: p.id,
      label: `${p.client_name} – ${p.description} (€${p.price_inc}) op ${p.date.split("T")[0]}`
    }));

    const modalContent = document.createElement("div");
    modalContent.innerHTML = `
      <p class="mb-3 text-gray-700 dark:text-gray-300">Selecteer welke planningen je wilt factureren (Tag: ${tag}):</p>
      <div class="max-h-64 overflow-y-auto border p-2 rounded space-y-1 dark:border-gray-700">
        ${checkboxes.map(c =>
          `<label class="flex items-center gap-2">
             <input type="checkbox" class="chkPlanning" value="${c.id}" checked>
             <span>${c.label}</span>
           </label>`
        ).join("")}
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button id="cancelTagBulkBtn" class="btn btn-secondary">Annuleren</button>
        <button id="confirmTagBulkBtn" class="btn btn-ok">Verzenden</button>
      </div>
    `;

// --- Nieuwe uniforme modal --- //
const overlay = document.createElement("div");
overlay.className = "modal-overlay";

const card = document.createElement("div");
card.className = "modal-card";
card.innerHTML = modalContent.innerHTML;

overlay.appendChild(card);
document.body.appendChild(overlay);

// ❌ Annuleren
card.querySelector("#cancelTagBulkBtn").onclick = () => overlay.remove();

// ✅ Verzenden
card.querySelector("#confirmTagBulkBtn").onclick = async () => {
  const selectedIds = [...card.querySelectorAll(".chkPlanning:checked")].map(i => i.value);

  if (!selectedIds.length) {
    showToast("Geen planningen geselecteerd", "warning");
    return;
  }

  showToast(`Versturen van ${selectedIds.length} facturen gestart...`, "info");

  const res = await fetch("/api/invoices-yuki/tag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, selectedIds }),
  });

  const data = await res.json();
  overlay.remove();

  if (res.ok) showToast(data.summary || "Facturatie gestart", "success");
  else showToast(data.error || "Fout bij verzenden", "error");

  await renderInvoices();
};
 });
};
}




// ---------- 🧾 Factuur detail ----------
function openInvoiceDetail(i) {
  openModal(`Factuur – ${i.client_name || "-"}`, [
    { id: "client", label: "Klant", value: i.client_name || "-", readonly: true },
    { id: "contract", label: "Contract ID", value: i.contract_id || "-", readonly: true },
    { id: "planning", label: "Planning ID", value: i.planning_id || "-", readonly: true },
    { id: "amount", label: "Bedrag", value: `€${Number(i.amount || 0).toFixed(2)}`, readonly: true },
    { id: "date", label: "Datum", value: i.created_at?.split("T")[0] || "-", readonly: true },
    { id: "method", label: "Methode", value: i.method || "-", readonly: true },
    { id: "status", label: "Toor Status", value: i.status || "open", readonly: true },
    { id: "yuki_status", label: "Yuki Status", value: i.yuki_status || "-", readonly: true },
  ], null, null, true);
}

// helper
function getStartOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// ---------- 📧 Facturatie Log ----------
async function renderEmailLog() {
  console.log("🧾 renderEmailLog() gestart");

  const list = document.getElementById("emailLogList");
  if (!list) {
    console.warn("⚠️ Element emailLogList niet gevonden!");
    return;
  }

  try {
    console.log("🌐 Ophalen van logs...");
    const res = await fetch("/api/yuki-log");
    console.log("✅ Fetch uitgevoerd, status:", res.status);

    if (!res.ok) {
      console.error("❌ Foutieve response:", res.status);
      showToast("Fout bij ophalen facturatielog", "error");
      return;
    }

    const logs = await res.json();
    console.log("📊 Aantal logrecords ontvangen:", logs.length);
    console.table(logs);

    if (!Array.isArray(logs) || !logs.length) {
      list.innerHTML = `<p class='text-gray-500 p-3'>Geen facturatie logs gevonden.</p>`;
      return;
    }

    const rows = logs.map(l => [
      l.created_at ? l.created_at.split("T")[0] : "-",
      l.client_name || "-",
      l.email || "-",
      l.amount ? `€${Number(l.amount).toFixed(2)}` : "€0.00",
      l.succeeded ? "✅ Ja" : "❌ Nee",
      l.message || "-"
    ]);

    list.innerHTML = tableHTML(
      ["Datum", "Klant", "E-mail", "Bedrag", "Gelukt", "Bericht"],
      rows
    );

    console.log("📋 Logtabel gerenderd");
  } catch (err) {
    console.error("💥 Fout in renderEmailLog():", err);
    showToast("Fout bij laden facturatielog", "error");
  }
}



// ---------- 🧍 Members ----------
async function renderMembers() {
  const list = document.getElementById("membersList");

  try {
    // ✅ Altijd live ophalen uit DB
    const res = await fetch("/api/members");
    if (!res.ok) throw new Error("Fout bij ophalen members");
    members = await res.json();

    // ✅ Tabelrijen
    const rows = members.map(m => [
       m.name,
        m.email || "-",
  m.phone || "-",
  (m.roles || []).join(", "),
  m.reden || "-",
  m.van_date ? m.van_date.split("T")[0] : "-",
  m.end_date ? m.end_date.split("T")[0] : "-",
  m.active ? "Actief" : "Inactief"
    ]);

    list.innerHTML = `
    <div class="overflow-y-auto max-h-[70vh] relative">
    ${tableHTML(
      ["Naam", "E-mail", "Telefoon", "Rol(len)", "Reden", "Van", "Tot en met", "Status"],
      rows
    )}
    </div>
    `;

    // Klik op rij = open detail
    list.querySelectorAll("tbody tr").forEach((tr, i) =>
      tr.addEventListener("click", () => openMemberDetail(members[i]))
    );

    // ✅ Nieuw member toevoegen
    document.getElementById("newMemberBtn").onclick = () =>
      openModal("Nieuwe Member", [
        { id: "name", label: "Naam" },
        { id: "email", label: "E-mail" },
        { id: "phone", label: "Telefoon" },
        { id: "roles", label: "Rol(len)", type: "multiselect", options: settings.roles },
        { id: "active", label: "Status", type: "select", options: ["Actief", "Inactief"], value: "Actief" },
      ], async (vals) => {
        try {
          vals.roles = Array.isArray(vals.roles) ? vals.roles : [];
          vals.active = vals.active === "Actief"; // ✅ converteer naar boolean

          const res = await fetch("/api/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(vals),
          });

          if (!res.ok) throw new Error("Fout bij toevoegen member");
          const nieuw = await res.json();
          members.unshift(nieuw);
          showToast(`Member ${nieuw.name} toegevoegd`, "success");
          renderMembers();
        } catch (err) {
          console.error("❌ Member insert error:", err);
          showToast("Fout bij toevoegen member", "error");
        }
      });
  } catch (err) {
    console.error("❌ Fout bij laden members:", err);
    showToast("Fout bij laden members", "error");
  }
}

function openMemberDetail(m) {
  openModal(`Member bewerken – ${m.name}`, [

    { id: "name", label: "Naam", value: m.name },
    { id: "email", label: "E-mail", value: m.email },
    { id: "phone", label: "Telefoon", value: m.phone },

    { id: "roles", label: "Rol(len)", type: "multiselect",
      options: settings.roles, value: m.roles || [] },

    { id: "active", label: "Status", type: "select",
      options: ["Actief", "Inactief"],
      value: m.active ? "Actief" : "Inactief"
    },

    { id: "reden", label: "Reden", type: "select",
      options: ["", ...settings.reasons],
      value: m.reden || ""
    },

    { id: "van_date", label: "Van (datum)", type: "date",
      value: m.van_date ? m.van_date.split("T")[0] : "" },

    { id: "end_date", label: "Tot en met (datum)", type: "date",
      value: m.end_date ? m.end_date.split("T")[0] : "" },

    // -----------------------------------------------
    // ⭐ CUSTOM INFO BLOK (stap 2)
    // -----------------------------------------------
    {
      id: "reactivateInfo",
      type: "custom",
      render: () => {
        if (!m.end_date) return "";

        const dt = new Date(m.end_date);
        dt.setDate(dt.getDate() + 1);

        const formatted = dt.toISOString().split("T")[0];

        return `
          <div data-id="reactivateInfoBox"
               class="p-2 mt-2 rounded bg-blue-100 text-blue-800 
                      dark:bg-blue-900 dark:text-blue-200 text-sm">
            🔄 Deze medewerker wordt automatisch weer actief op 
            <strong>${formatted}</strong>
          </div>
        `;
      }
    },
    {
  id: "historyBlock",
  type: "custom",
  render: () => `
    <div class="mt-4">
      <h3 class="font-semibold mb-2">Historie</h3>
      <div id="memberHistory" class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <div>⏳ Laden...</div>
      </div>
    </div>
  `
}

  ], async (vals) => {
    // ---------------------------------------
    // 🔄 BASIC CLEANUP / CONVERSIONS
    // ---------------------------------------
    vals.roles = Array.isArray(vals.roles) ? vals.roles : [];
    vals.active = vals.active === "Actief";  // dropdown → boolean

    // ---------------------------------------
    // 🔍 VALIDATIES OP BASIS VAN REDEN
    // ---------------------------------------
    if (!vals.active && !vals.reden) {
      return showToast("Reden is verplicht wanneer een medewerker Inactief wordt gezet", "error");
    }

    if (vals.reden === "Ziek" && !vals.van_date) {
      return showToast("'Van' datum is verplicht bij reden Ziek", "error");
    }

    if (vals.reden === "Vakantie") {
      if (!vals.van_date) return showToast("'Van' datum is verplicht bij Vakantie", "error");
      if (!vals.end_date) return showToast("'Tot en met' datum is verplicht bij Vakantie", "error");
    }

    if (vals.reden === "Niet meer werkzaam voor ons" && !vals.van_date) {
      return showToast("'Van' datum is verplicht bij deze reden", "error");
    }

    // ---------------------------------------
    // 🚀 PUT REQUEST
    // ---------------------------------------
    const res = await fetch(`/api/members/${m.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vals),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("❌ Member update error:", err);
      return showToast(err.error || "Fout bij opslaan member", "error");
    }

    const updated = await res.json();
    Object.assign(m, updated);

    showToast("Member opgeslagen", "success");
    renderMembers();
    // geschiedenis opnieuw laden
loadHistory();

  }, () => confirmDelete("member", async () => {
    try {
      const res = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Fout bij verwijderen member");

      members = members.filter(x => x.id !== m.id);
      showToast("Member verwijderd", "success");
      renderMembers();
    } catch (err) {
      console.error("❌ Member delete error:", err);
      showToast("Fout bij verwijderen member", "error");
    }
  }));

  // -------------------------------------------------
  // ⭐ LIVE UPDATE LOGICA (stap 3)
  // -------------------------------------------------
  setTimeout(() => {
    const endDateInput = document.getElementById("end_date");
    const redenInput = document.getElementById("reden");
    const infoBox = document.querySelector("[data-id='reactivateInfoBox']");

    function updateInfo() {
      if (!infoBox) return;

      const endDate = endDateInput.value;
      const reden = redenInput.value;

      if (endDate && (reden === "Vakantie" || reden === "Ziek")) {
        const dt = new Date(endDate);
        dt.setDate(dt.getDate() + 1);
        const formatted = dt.toISOString().split("T")[0];

        infoBox.innerHTML = `
          🔄 Deze medewerker wordt automatisch weer actief op 
          <strong>${formatted}</strong>
        `;
      } else {
        infoBox.innerHTML = "";
      }
    }

    endDateInput?.addEventListener("change", updateInfo);
    redenInput?.addEventListener("change", updateInfo);

  }, 200);
  // ===============================================
// ⭐ Load Member History
// ===============================================
async function loadHistory() {
  const historyBox = document.getElementById("memberHistory");
  if (!historyBox) return;

  const res = await fetch(`/api/members/${m.id}/history`);
  if (!res.ok) {
    historyBox.innerHTML = "<div class='text-danger'>❌ Fout bij laden historie</div>";
    return;
  }

  const rows = await res.json();

  if (!rows.length) {
    historyBox.innerHTML = "<div class='text-gray-500'>Geen wijzigingen geregistreerd</div>";
    return;
  }

  historyBox.innerHTML = rows.map(h => {
    const dt = new Date(h.created_at).toLocaleString();

    return `
      <div class="p-2 border rounded bg-gray-50 dark:bg-gray-800">
        <div class="font-medium">${dt}</div>

        <div>Status: 
          <strong>${h.active_after ? "Actief" : "Inactief"}</strong>
          ${h.active_before !== h.active_after ? "⚠️ (gewijzigd)" : ""}
        </div>

        ${h.reden ? `<div>Reden: <strong>${h.reden}</strong></div>` : ""}
        ${h.van_date ? `<div>Van: ${h.van_date.split("T")[0]}</div>` : ""}
        ${h.tot_date ? `<div>Tot en met: ${h.tot_date.split("T")[0]}</div>` : ""}
      </div>
    `;
  }).join("");
}

setTimeout(loadHistory, 150);
}





function renderLeads(){
  const list=document.getElementById("leadsList");
  list.innerHTML=tableHTML(["Naam","E-mail","Telefoon","Bron"],
    leads.map(l=>[l.name,l.email,l.phone,l.source]));
  list.querySelectorAll("tbody tr").forEach((tr,i)=>
    tr.addEventListener("click",()=>openLeadDetail(leads[i])));
  document.getElementById("newLeadBtn").onclick=()=>openModal("Nieuwe Lead",[
    {id:"name",label:"Naam"},{id:"email",label:"E-mail"},
    {id:"phone",label:"Telefoon"},{id:"source",label:"Bron"},
  ],vals=>{
    leads.push({id:Date.now(),...vals});
    showToast("Lead toegevoegd","success");renderLeads();
  });
}
function openLeadDetail(l){
  openModal(`Lead bewerken – ${l.name}`,[
    {id:"name",label:"Naam",value:l.name},
    {id:"email",label:"E-mail",value:l.email},
    {id:"phone",label:"Telefoon",value:l.phone},
    {id:"source",label:"Bron",value:l.source},
  ],vals=>{
    Object.assign(l,vals);
    showToast("Lead opgeslagen","success");renderLeads();
  },()=>confirmDelete("lead",()=>{
    leads=leads.filter(x=>x.id!==l.id);
    renderLeads();showToast("Lead verwijderd","success");
  }));
}
function renderQuotes(){
  const list=document.getElementById("quotesList");
  list.innerHTML=tableHTML(["Titel","Klant","Bedrag","Status"],
    quotes.map(q=>[q.title,q.contact,`€${q.amount}`,q.status]));
  list.querySelectorAll("tbody tr").forEach((tr,i)=>
    tr.addEventListener("click",()=>openQuoteDetail(quotes[i])));
  document.getElementById("newQuoteBtn").onclick=()=>openModal("Nieuwe Offerte",[
    {id:"title",label:"Titel"},
    {id:"contact",label:"Klant",type:"select",options:clients.map(c=>c.name)},
    {id:"amount",label:"Bedrag (€)"},
  ],vals=>{
    quotes.push({id:Date.now(),...vals,amount:parseFloat(vals.amount||0),status:"Concept"});
    showToast("Offerte toegevoegd","success");renderQuotes();
  });
}
function openQuoteDetail(q){
  openModal(`Offerte bewerken – ${q.title}`,[
    {id:"title",label:"Titel",value:q.title},
    {id:"contact",label:"Klant",type:"select",options:clients.map(c=>c.name),value:q.contact},
    {id:"amount",label:"Bedrag (€)",value:q.amount},
    {id:"status",label:"Status",type:"select",
      options:["Concept","Verzonden","Geaccepteerd","Geweigerd"],value:q.status},
  ],vals=>{
    Object.assign(q,{...vals,amount:parseFloat(vals.amount||0)});
    showToast("Offerte opgeslagen","success");renderQuotes();
  },()=>confirmDelete("offerte",()=>{
    quotes=quotes.filter(x=>x.id!==q.id);
    renderQuotes();showToast("Offerte verwijderd","success");
  }));
}

// ---------- Instellingen ----------
async function renderSettings(){
  const blk = (title, arr, add, rem) => `
    <div class="border rounded p-4 bg-white dark:bg-gray-900">
      <h3 class="font-semibold mb-2">${title}</h3>
      <div class="flex gap-2 mb-3">
        <input id="${title}-input" class="border rounded px-2 py-1 flex-grow dark:bg-gray-800" placeholder="Nieuwe ${title.toLowerCase()}"/>
        <button onclick="${add}" class="bg-primary text-white px-3 py-1 rounded">Toevoegen</button>
      </div>
      <ul class="space-y-1">
        ${arr.map((x,i)=>`
          <li class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
            <span>${x}</span>
            <button onclick="${rem}(${i})" class="text-danger text-sm">Verwijderen</button>
          </li>`).join("")}
      </ul>
    </div>`;

  // === DYNAMISCH ophalen van Reasons ===
  const rRes = await fetch("/api/member-reasons");
  const reasonsRaw = rRes.ok ? await rRes.json() : [];
  settings.reasons = reasonsRaw.map(r => r.name);

  document.getElementById("typeServiceSettings").innerHTML=blk("Type Services",settings.typeServices,"addTypeService()","removeTypeService");
  document.getElementById("frequenciesSettings").innerHTML=blk("Frequenties",settings.frequencies,"addFrequency()","removeFrequency");
  document.getElementById("rolesSettings").innerHTML=blk("Rollen",settings.roles,"addRole()","removeRole");
  document.getElementById("tagsSettings").innerHTML=blk("Tags",settings.tags,"addTag()","removeTag");
  // ==== REASONS BLOK ====
  document.getElementById("reasonsSettings").innerHTML = `
    <div class="border rounded p-4 bg-white dark:bg-gray-900">
      <h3 class="font-semibold mb-2">Redenen (Members)</h3>

      <div class="flex gap-2 mb-3">
        <input id="reasons-input" class="border rounded px-2 py-1 flex-grow dark:bg-gray-800" placeholder="Nieuwe reden"/>
        <button id="addReasonBtn" class="bg-primary text-white px-3 py-1 rounded">Toevoegen</button>
      </div>

      <ul id="reasonList" class="space-y-1">
        ${settings.reasons.map(r=>`
          <li class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
            <span>${r}</span>
            <button class="text-danger text-sm reason-del" data-value="${r}">Verwijderen</button>
          </li>
        `).join("")}
      </ul>
    </div>
  `;

  // ==== EVENT HANDLERS ====
  document.getElementById("addReasonBtn").onclick = async () => {
    const val = document.getElementById("reasons-input").value.trim();
    if (!val) return showToast("Vul een reden in", "error");

    await fetch("/api/member-reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: val })
    });

    renderSettings(); // herladen
  };

  document.querySelectorAll(".reason-del").forEach(btn => {
    btn.onclick = async () => {
      const val = btn.dataset.value;
      await fetch("/api/member-reasons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: val })
      });
      renderSettings();
    };
  });
}

function addTypeService(){addItem("Type Services","typeServices");}
function removeTypeService(i){settings.typeServices.splice(i,1);renderSettings();}
function addFrequency(){addItem("Frequenties","frequencies");}
function removeFrequency(i){settings.frequencies.splice(i,1);renderSettings();}
function addRole(){addItem("Rollen","roles");}
function removeRole(i){settings.roles.splice(i,1);renderSettings();}
function addTag(){addItem("Tags","tags");}
function removeTag(i){settings.tags.splice(i,1);renderSettings();}
function addItem(lbl,key){
  const v=document.getElementById(`${lbl}-input`).value.trim();
  if(!v)return showToast("Vul een waarde in","error");
  settings[key].push(v);renderSettings();showToast(`${lbl} toegevoegd`,"success");
}
// ---------- 🎨 Thema ----------
function setupThemeButtons() {
  const themeButtons = document.querySelectorAll("#themeLight, #themeDark");
  themeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const isDark = btn.id === "themeDark";
      document.documentElement.classList.toggle("dark", isDark);
      localStorage.setItem("theme", isDark ? "dark" : "light");
      showToast(`Thema gewijzigd naar ${isDark ? "Donker" : "Licht"}`, "info");
    });
  });

  // Laad opgeslagen voorkeur
  const saved = localStorage.getItem("theme");
  if (saved) {
    document.documentElement.classList.toggle("dark", saved === "dark");
  }
}


// ---------- Helpers ----------
function openModal(title, fields, onSave, onDelete) {
  // Sluit eerst eventueel openstaande modals
  document.querySelectorAll(".modal-overlay").forEach(el => el.remove());

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const card = document.createElement("div");
  card.className = "modal-card";

  card.innerHTML = `
    <h2 class="text-lg font-semibold mb-4">${title}</h2>
    <form id="modalForm" class="flex flex-col">
      <div id="formFields" class="flex-1 overflow-y-auto"></div>
      <div class="flex justify-end gap-2 mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button type="button" id="delBtn" class="btn btn-warn hidden">Verwijderen</button>
        <button type="button" id="cancel" class="btn btn-secondary">Annuleren</button>
        <button type="submit" id="save" class="btn btn-ok">Opslaan</button>
      </div>
    </form>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const form = card.querySelector("#modalForm");
  const fieldsContainer = form.querySelector("#formFields");

  // ---------- Velden opbouwen ----------
  fields.forEach(f => {
    const div = document.createElement("div");
    div.className = "form-field";
    if (f.hidden) div.style.display = "none";
    const label = document.createElement("label");
    label.textContent = f.label;
    let input;

    switch (f.type) {
           case "custom":
        div.innerHTML = `
          <label>${f.label}</label>
          ${typeof f.render === "function" ? f.render() : f.render || ""}
        `;
        fieldsContainer.appendChild(div);
        return;
      case "select":
        input = document.createElement("select");
        input.className = "select";
        input.name = f.id;
        f.options.forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          if (opt === f.value) o.selected = true;
          input.appendChild(o);
        });
        break;

      case "multiselect":
        div.classList.add("space-y-1");
        f.options.forEach(opt => {
          const wrap = document.createElement("label");
          wrap.className = "flex items-center gap-2";
          const chk = document.createElement("input");
          chk.type = "checkbox";
          chk.name = f.id;
          chk.value = opt;
          chk.checked = Array.isArray(f.value) && f.value.includes(opt);
          wrap.appendChild(chk);
          wrap.append(opt);
          div.appendChild(wrap);
        });
        break;

      case "date":
  input = document.createElement("input");
  input.type = "date";
  input.className = "input";
  input.name = f.id;

  // 🛠️ ISO → yyyy-mm-dd (veilig)
  if (f.value) {
    let iso = f.value;
    if (typeof iso === "string" && iso.includes("T")) {
      iso = iso.split("T")[0];
    }
    input.value = iso;
  }
  break;

      case "readonly":
        input = document.createElement("input");
        input.className = "input";
        input.name = f.id;
        input.readOnly = true;
        input.value = f.value || "";
        break;

      case "checkbox":
        input = document.createElement("input");
        input.type = "checkbox";
        input.name = f.id;
        input.checked = !!f.value;
        break;

      default:
        input = document.createElement("input");
        input.className = "input";
        input.name = f.id;
        if (f.value) input.value = f.value;
        break;
    }

    if (input) {
      div.appendChild(label);
      div.appendChild(input);
    } else {
      div.prepend(label);
    }
    fieldsContainer.appendChild(div);
  });

  // ---------- Businessvelden toggle ----------
  const typeSelect = form.querySelector("[name='typeKlant']");
  if (typeSelect) {
    const toggleBusinessFields = () => {
      const val = (typeSelect.value || "").toLowerCase();
      const isBusiness = val === "zakelijk";
      ["bedrijfsnaam", "kvk", "btw"].forEach(id => {
        const field = form.querySelector(`[name='${id}']`)?.closest(".form-field");
        if (field) field.style.display = isBusiness ? "block" : "none";
      });
    };
    toggleBusinessFields();
    typeSelect.addEventListener("change", toggleBusinessFields);
  }

  // ---------- Delete-knop ----------
  const delBtn = card.querySelector("#delBtn");
  if (onDelete) {
    delBtn.classList.remove("hidden");
    delBtn.onclick = () => {
      confirmDelete("record", () => {
        onDelete();
        overlay.remove();
      });
    };
  } else {
    delBtn.classList.add("hidden");
    delBtn.onclick = null;
  }

  const cancelBtn = card.querySelector("#cancel");
  cancelBtn.onclick = () => overlay.remove();

  // ---------- Dirty-check ----------
  function snapshot() {
    const snap = {};
    fields.forEach(f => {
      if (f.type === "multiselect") {
        snap[f.id] = Array.from(form.querySelectorAll(`input[name='${f.id}']:checked`)).map(x => x.value);
      } else if (f.type === "checkbox") {
        const inp = form.querySelector(`[name='${f.id}']`);
        snap[f.id] = !!(inp && inp.checked);
      } else {
        const inp = form.querySelector(`[name='${f.id}']`);
        snap[f.id] = inp ? inp.value : null;
      }
    });
    return JSON.stringify(snap);
  }

  let initialSnap = snapshot();
  let isDirty = false;
  form.addEventListener("input", () => {
    isDirty = snapshot() !== initialSnap;
  });

  // ---------- Klik buiten modal ----------
  overlay.addEventListener("click", e => {
    if (e.target !== overlay) return;
    if (isDirty) {
      showToast("Je hebt onopgeslagen wijzigingen. Gebruik Opslaan of Annuleren.", "info");
      return;
    }
    overlay.remove();
  });

  // ---------- ESC-toets ----------
  document.addEventListener("keydown", function escHandler(ev) {
    if (ev.key === "Escape") {
      if (document.body.contains(overlay)) {
        if (isDirty) {
          showToast("Je hebt onopgeslagen wijzigingen. Gebruik Opslaan of Annuleren.", "info");
        } else {
          overlay.remove();
        }
        ev.preventDefault();
      }
    }
  });

  // ---------- Opslaan (met knopbeveiliging) ----------
  form.onsubmit = async e => {
    e.preventDefault();
    const saveBtn = card.querySelector("#save");
    const cancelBtn = card.querySelector("#cancel");
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = "Opslaan...";

    const vals = {};
    fields.forEach(f => {
      if (f.type === "multiselect") {
        vals[f.id] = Array.from(form.querySelectorAll(`input[name='${f.id}']:checked`)).map(x => x.value);
      } else if (f.type === "checkbox") {
        const inp = form.querySelector(`[name='${f.id}']`);
        vals[f.id] = !!(inp && inp.checked);
      } else {
        const inp = form.querySelector(`[name='${f.id}']`);
        vals[f.id] = inp ? inp.value : null;
      }
    });

    try {
      await onSave(vals);
      overlay.remove();
    } catch (err) {
      console.error("Form save error:", err);
      showToast("Opslaan mislukt", "error");
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = "Opslaan";
    }
  };
}

// ---------- 🗓️ Bereken volgende bezoekdatum ----------
function calcNextVisit(lastVisit, frequency) {
  if (!lastVisit) return "-";
  const date = new Date(lastVisit);
  const freq = frequency.toLowerCase();

  let days = 30;
  if (freq.includes("week")) days = 7;
  if (freq.includes("3") && freq.includes("week")) days = 21;
  if (freq.includes("4") && freq.includes("week")) days = 28;
  if (freq.includes("6") && freq.includes("week")) days = 42;
  if (freq.includes("8") && freq.includes("week")) days = 56;
  if (freq.includes("12") && freq.includes("week")) days = 84;
  if (freq.includes("jaar")) days = 365;

  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// ---------- 📋 Hulpfunctie voor tabellen ----------
// =========================================================
// 📊 Tabel renderer met automatische NL datumformatting
// =========================================================
function tableHTML(headers, rows) {

  function formatCell(val) {
    if (val === null || val === undefined) return "";

    // Herken ISO-date (yyyy-mm-dd of yyyy-mm-ddTHH:mm)
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return toNLDate(val);
    }

    return val;
  }

  return `
    <table class="min-w-full border-collapse text-sm">
      <thead>
        <tr>
          ${headers.map(h => `<th class="border-b p-2 text-left font-semibold">${h}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
            ${r.map(v => `<td class="border-b p-2">${formatCell(v)}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ---------- 🗑️ Bevestigingsdialoog ----------
function confirmDelete(typeLabel, onConfirm) {
  const ok = confirm(`Weet je zeker dat je deze ${typeLabel} wilt verwijderen?`);
  if (ok) onConfirm();
}
// ---------- ✅ Toast helper ----------
function showToast(message, type = "info") {
  const colors = {
    info: "bg-blue-600",
    success: "bg-green-600",
    error: "bg-red-600",
  };
  const toast = document.createElement("div");
  toast.className = `${colors[type] || colors.info} fixed bottom-4 right-4 text-white px-4 py-2 rounded shadow-lg z-50`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------- 🧩 DEBUG PANEL ----------
function appendDebug(msg) {
  const dbg = document.getElementById("debugPanel");
  if (!dbg) return;
  const line = document.createElement("div");
  line.className = "text-xs border-b border-gray-700 py-0.5";
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  dbg.prepend(line);
}
// ===========================================================
// 🔁 Auto-refresh functionaliteit (blijft in huidig tabblad)
// ===========================================================
setInterval(async () => {
  try {
    switch (activeTab) {
      case "clients":
        // ✅ Volledig herladen van clients (om nieuwe te tonen)
        await renderClients();
        break;

      case "contracts":
        await renderContracts();
        break;

      case "planning":
        // ✅ Alleen data verversen, filters behouden
        await loadPlanningData();
        break;

      case "invoices":
        await renderInvoices();
        break;

      case "members":
        await renderMembers();
        break;

      case "emailLog":
        await renderEmailLog();
        break;

      case "leads":
        await renderLeads();
        break;

      case "quotes":
        await renderQuotes();
        break;

      case "settings":
        await renderSettings();
        break;

      default:
        // Geen actief tabblad? doe niks
        break;
    }
  } catch (err) {
    console.warn("Auto-refresh fout:", err.message);
  }
}, 30000); // elke 30 seconden automatisch vernieuwen

/**************************************************************
 *   TOOR AI CHAT ASSISTANT – Front-End Logic
 **************************************************************/

let aiChatHistory = [];

const aiBtn = document.getElementById("aiChatButton");
const aiPanel = document.getElementById("aiChatPanel");
const aiClose = document.getElementById("aiChatClose");
const aiInput = document.getElementById("aiChatInput");
const aiSend = document.getElementById("aiChatSend");
const aiMessages = document.getElementById("aiChatMessages");

// Panel open/close
aiBtn.onclick = () => aiPanel.classList.remove("hidden");
aiClose.onclick = () => aiPanel.classList.add("hidden");

// Scroll helper
function scrollChatToBottom() {
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

// Add user or assistant message
function addChatMessage(sender, text) {
  const bubble =
    sender === "user"
      ? `<div class="text-right"><div class="inline-block bg-primary text-white px-3 py-2 rounded-lg max-w-[90%]">${text}</div></div>`
      : `<div class="text-left"><div class="inline-block bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg max-w-[90%]">${text}</div></div>`;

  aiMessages.insertAdjacentHTML("beforeend", bubble);
  scrollChatToBottom();
}

// Send question to backend
async function sendChatQuestion() {
  const question = aiInput.value.trim();
  if (!question) return;

  // Show user bubble
  addChatMessage("user", question);
  aiInput.value = "";
  aiInput.focus();

  // Add loader bubble
  const loaderId = "loader-" + Date.now();
  aiMessages.insertAdjacentHTML(
    "beforeend",
    `<div id="${loaderId}" class="text-left"><div class="inline-block bg-gray-200 dark:bg-gray-700 text-gray-500 px-3 py-2 rounded-lg">...</div></div>`
  );
  scrollChatToBottom();

  try {
    const res = await fetch("/api/assistant/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const data = await res.json();

    // Remove loader
    document.getElementById(loaderId)?.remove();

    // Add assistant bubble
    addChatMessage("assistant", data.answer || "Geen antwoord ontvangen.");
  } catch (err) {
    console.error("AI Chat error:", err);
    document.getElementById(loaderId)?.remove();
    addChatMessage("assistant", "Er ging iets mis bij het ophalen van het antwoord.");
  }
}

// Events
aiSend.onclick = sendChatQuestion;
aiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatQuestion();
});


