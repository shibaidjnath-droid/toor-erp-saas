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
};

// ---------- Dummydata ----------
let clients = [

];

let contracts = [
  
];

let planning = [
  
];

let invoices = [
  
];

let members = [
 
];

let emailLog = [
];

let leads = [
  
];

let quotes = [
  
];

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
  const rows = clients.map(c => [
    c.name,
    c.email,
    c.phone,
    c.type_klant,
    c.verzend_methode,
    c.tag || "-",
    c.status || "Active"
  ]);

  list.innerHTML = tableHTML(
    ["Naam", "E-mail", "Telefoon", "Type klant", "Verzendmethode", "Tag", "Status"],
    rows
  );

  // Klik op rij = open klantdetail
  list.querySelectorAll("tbody tr").forEach((tr, i) =>
    tr.addEventListener("click", () => openClientDetail(clients[i]))
  );

  // ✅ Nieuw klant toevoegen
  document.getElementById("newClientBtn").onclick = () =>
    openModal("Nieuwe Klant", [
      { id: "name", label: "Naam" },
      { id: "email", label: "E-mail" },
      { id: "phone", label: "Telefoon" },
      { id: "address", label: "Adres" },
      { id: "houseNumber", label: "Huisnummer" },
      { id: "city", label: "Plaats" },
      { id: "typeKlant", label: "Type Klant", type: "select", options: ["Particulier", "Zakelijk"], value: "Particulier" },
      { id: "bedrijfsnaam", label: "Bedrijfsnaam", hidden: true },
      { id: "kvk", label: "KvK", hidden: true },
      { id: "btw", label: "BTW", hidden: true },
      { id: "verzendMethode", label: "Verzendmethode", type: "select", options: ["Whatsapp", "Email"], value: "Email" },
      { id: "tag", label: "Tag", type: "select", options: settings.tags },

      // ---- Contractsectie ----
      { id: "contract_typeService", label: "Contract: Type Service", type: "multiselect", options: settings.typeServices },
      { id: "contract_frequency", label: "Contract: Frequentie", type: "select", options: settings.frequencies },
      { id: "contract_description", label: "Contract: Beschrijving" },
      { id: "contract_priceInc", label: "Contract: Prijs incl. (€)" },
      { id: "contract_vat", label: "Contract: BTW (%)", type: "select", options: ["21", "9", "0"], value: "21" },
      { id: "contract_lastVisit", label: "Contract: Laatste bezoek", type: "date" },
    ], async (vals) => {
      try {
        // 🔹 Klant opslaan
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(vals),
        });

        if (!res.ok) {
          showToast("Fout bij opslaan van klant", "error");
          return;
        }

        const klant = await res.json();
        showToast(`Klant ${klant.name} aangemaakt`, "success");

        // Klant toevoegen aan lokale lijst
        clients.push(klant);

        // 🔹 Indien contractvelden ingevuld zijn → contractlijst vernieuwen
        if (vals.contract_typeService || vals.contract_description) {
          const cRes = await fetch("/api/contracts");
          if (cRes.ok) {
            contracts = await cRes.json();
            showToast("Contract gekoppeld en bijgewerkt", "success");
          }
        }

        renderClients();
      } catch (err) {
        console.error("❌ Fout bij opslaan klant:", err);
        showToast("Onverwachte fout bij opslaan klant", "error");
      }
    });

  // ✅ Import knop
  document.getElementById("importClientsBtn").onclick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx";
    input.onchange = async (e) => {
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
    { id: "city", label: "Plaats", value: c.city },
    { id: "typeKlant", label: "Type Klant", type: "select", options: ["Particulier", "Zakelijk"], value: c.type_klant },
    { id: "bedrijfsnaam", label: "Bedrijfsnaam", value: c.bedrijfsnaam || "", hidden: c.type_klant !== "Zakelijk" },
    { id: "kvk", label: "KvK", value: c.kvk || "", hidden: c.type_klant !== "Zakelijk" },
    { id: "btw", label: "BTW", value: c.btw || "", hidden: c.type_klant !== "Zakelijk" },
    { id: "verzendMethode", label: "Verzendmethode", type: "select", options: ["Whatsapp", "Email"], value: c.verzend_methode },
    { id: "tag", label: "Tag", type: "select", options: settings.tags, value: c.tag },
    { id: "status", label: "Status", type: "select", options: ["Active", "Inactive"], value: c.status },
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
}


// 📄 Contracten
async function renderContracts() {
  const list = document.getElementById("contractsList");

  try {
    // ✅ Altijd live data uit DB ophalen
    const res = await fetch("/api/contracts");
    if (!res.ok) throw new Error("Fout bij ophalen contracten");
    contracts = await res.json();

    // ✅ Tabelrijen genereren
    const rows = contracts.map(c => [
      c.client_name || "-",                                        // gekoppelde klantnaam via SQL JOIN
      Array.isArray(c.type_service) ? c.type_service.join(", ") : (c.type_service || "-"),
      c.frequency || "-",
      c.description || "-",
      c.price_inc ? `€${Number(c.price_inc).toFixed(2)}` : "€0.00",
      c.vat_pct ? `${c.vat_pct}%` : "-",
      c.last_visit ? c.last_visit.split("T")[0] : "-",
      c.next_visit ? c.next_visit.split("T")[0] : "-"
    ]);

    // ✅ Tabellen renderen
    list.innerHTML = tableHTML(
      ["Klant", "Type service", "Frequentie", "Beschrijving", "Prijs incl.", "BTW %", "Laatste bezoek", "Volgende bezoek"],
      rows
    );

    // ✅ Klik op rij = open contractdetail
    list.querySelectorAll("tbody tr").forEach((tr, i) =>
      tr.addEventListener("click", () => openContractDetail(contracts[i]))
    );

    // ✅ Nieuw contract toevoegen
    document.getElementById("newContractBtn").onclick = () =>
      openModal("Nieuw Contract", [
        { id: "clientId", label: "Klant", type: "select", options: clients.map(c => c.name) },
        { id: "typeService", label: "Type service", type: "multiselect", options: settings.typeServices },
        { id: "frequency", label: "Frequentie", type: "select", options: settings.frequencies },
        { id: "description", label: "Beschrijving" },
        { id: "priceEx", label: "Prijs excl. (€)" },
        { id: "vatPct", label: "BTW (%)", type: "select", options: ["21", "9", "0"], value: "21" },
        { id: "lastVisit", label: "Laatste bezoek", type: "date" },
      ], async (vals) => {
        try {
          // Zoek contactId van geselecteerde klant
          const client = clients.find(c => c.name === vals.clientId);
          if (!client) return showToast("Selecteer een bestaande klant", "error");

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
          contracts.unshift(contract); // bovenaan tonen
          showToast("Contract toegevoegd", "success");

          // 🔁 Direct opnieuw laden vanuit DB om lijst te verversen
          await renderContracts();
        } catch (err) {
          console.error("❌ Fout bij opslaan contract:", err);
          showToast("Onverwachte fout bij opslaan contract", "error");
        }
      });
  } catch (err) {
    console.error("❌ Fout bij laden contracten:", err);
    showToast("Fout bij laden contractenlijst", "error");
  }
}


function openContractDetail(c) {
  openModal(`Contract bewerken – ${c.client_name || "-"}`, [
    { id: "frequency", label: "Frequentie", type: "select", options: settings.frequencies, value: c.frequency },
    { id: "description", label: "Beschrijving", value: c.description },
    { id: "priceEx", label: "Prijs excl. (€)", value: c.price_ex },
    { id: "vatPct", label: "BTW (%)", type: "select", options: ["21", "9", "0"], value: c.vat_pct },
    { id: "lastVisit", label: "Laatste bezoek", type: "date", value: c.last_visit ? c.last_visit.split("T")[0] : "" },
    { id: "typeService", label: "Type service", type: "multiselect", options: settings.typeServices, value: c.type_service },
  ], async (vals) => {
    try {
      const res = await fetch(`/api/contracts/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency: vals.frequency,
          description: vals.description,
          priceEx: vals.priceEx,
          vatPct: vals.vatPct,
          lastVisit: vals.lastVisit,
          typeService: vals.typeService,
        }),
      });

      if (!res.ok) {
        showToast("Fout bij opslaan contract", "error");
        return;
      }

      const updated = await res.json();
      // vervang lokaal record zodat lijst direct ververst
      Object.assign(c, updated);
      showToast("Contract opgeslagen", "success");
      renderContracts();
    } catch (err) {
      console.error("❌ Fout bij opslaan contract:", err);
      showToast("Onverwachte fout bij opslaan contract", "error");
    }
  }, () => confirmDelete("contract", async () => {
    try {
      const res = await fetch(`/api/contracts/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Fout bij verwijderen contract", "error");
        return;
      }
      contracts = contracts.filter(x => x.id !== c.id);
      showToast("Contract verwijderd", "success");
      renderContracts();
    } catch (err) {
      console.error("❌ Fout bij verwijderen contract:", err);
      showToast("Onverwachte fout bij verwijderen contract", "error");
    }
  }));
}


// ---------- Planning ----------
function renderPlanning(){
  const list=document.getElementById("planningList");
  const rows=planning.map(p=>{
    const c=contracts.find(x=>x.id===p.contractId);
    const client=clients.find(cl=>cl.id===c?.clientId)?.name||"-";
    return [client,c?.description||"-",p.date,p.status];
  });
  list.innerHTML=tableHTML(["Klant","Contract","Datum","Status"],rows);
  list.querySelectorAll("tbody tr").forEach((tr,i)=>
    tr.addEventListener("click",()=>openPlanningDetail(planning[i])));
  document.getElementById("newPlanningBtn").onclick=()=>openModal("Nieuw Planning-item",[
    {id:"contract",label:"Contract",type:"select",options:contracts.map(c=>c.description)},
    {id:"date",label:"Datum",type:"date"},
    {id:"status",label:"Status",type:"select",options:["Gepland","Uitgevoerd","Geannuleerd"]},
  ],vals=>{
    const c=contracts.find(x=>x.description===vals.contract);
    planning.push({id:Date.now(),contractId:c?.id,date:vals.date,status:vals.status});
    showToast("Planning toegevoegd","success");renderPlanning();
  });
}
function openPlanningDetail(p){
  const c=contracts.find(x=>x.id===p.contractId);
  openModal("Planning bewerken",[
    {id:"contract",label:"Contract",type:"select",options:contracts.map(c=>c.description),value:c?.description},
    {id:"date",label:"Datum",type:"date",value:p.date},
    {id:"status",label:"Status",type:"select",options:["Gepland","Uitgevoerd","Geannuleerd"],value:p.status},
  ],vals=>{
    Object.assign(p,{
      contractId:contracts.find(x=>x.description===vals.contract)?.id,
      date:vals.date,status:vals.status
    });
    showToast("Planning opgeslagen","success");renderPlanning();
  },()=>confirmDelete("planning",()=>{
    planning=planning.filter(x=>x.id!==p.id);
    renderPlanning();showToast("Planning verwijderd","success");
  }));
}

// ---------- Facturen ----------
function renderInvoices(){
  const list=document.getElementById("invoicesList");
  const rows=invoices.map(i=>{
    const c=clients.find(x=>x.id===i.clientId)?.name||"-";
    return [c,`€${i.amount.toFixed(2)}`,i.date,i.status];
  });
  list.innerHTML=tableHTML(["Klant","Bedrag","Datum","Status"],rows);
  list.querySelectorAll("tbody tr").forEach((tr,i)=>
    tr.addEventListener("click",()=>openInvoiceDetail(invoices[i])));
  document.getElementById("newInvoiceBtn").onclick=()=>openModal("Nieuwe Factuur",[
    {id:"client",label:"Klant",type:"select",options:clients.map(c=>c.name)},
    {id:"contract",label:"Contract",type:"select",options:contracts.map(c=>c.description)},
    {id:"amount",label:"Bedrag incl. (€)"},
    {id:"date",label:"Datum",type:"date"},
    {id:"status",label:"Status",type:"select",options:["Open","Betaald","Achterstallig"]},
  ],vals=>{
    const cl=clients.find(c=>c.name===vals.client);
    const co=contracts.find(c=>c.description===vals.contract);
    invoices.push({id:Date.now(),clientId:cl?.id,contractId:co?.id,
      amount:parseFloat(vals.amount||0),date:vals.date,status:vals.status});
    showToast("Factuur toegevoegd","success");renderInvoices();
  });
}
function openInvoiceDetail(i){
  const cl=clients.find(x=>x.id===i.clientId);
  const co=contracts.find(x=>x.id===i.contractId);
  openModal(`Factuur bewerken – ${cl?.name||"-"}`,[
    {id:"client",label:"Klant",type:"select",options:clients.map(c=>c.name),value:cl?.name},
    {id:"contract",label:"Contract",type:"select",options:contracts.map(c=>c.description),value:co?.description},
    {id:"amount",label:"Bedrag (€)",value:i.amount},
    {id:"date",label:"Datum",type:"date",value:i.date},
    {id:"status",label:"Status",type:"select",options:["Open","Betaald","Achterstallig"],value:i.status},
  ],vals=>{
    Object.assign(i,{
      clientId:clients.find(c=>c.name===vals.client)?.id,
      contractId:contracts.find(c=>c.description===vals.contract)?.id,
      amount:parseFloat(vals.amount||0),date:vals.date,status:vals.status
    });
    showToast("Factuur opgeslagen","success");renderInvoices();
  },()=>confirmDelete("factuur",()=>{
    invoices=invoices.filter(x=>x.id!==i.id);
    renderInvoices();showToast("Factuur verwijderd","success");
  }));
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
      (m.roles || []).join(", ") || "-",
      m.active ? "✅ Actief" : "⛔ Inactief",
      m.end_date ? m.end_date.split("T")[0] : "-"
    ]);

    list.innerHTML = tableHTML(
      ["Naam", "E-mail", "Telefoon", "Rol(len)", "Status", "Tot en met"],
      rows
    );

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
        { id: "end_date", label: "Tot en met", type: "date" },
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
    { id: "roles", label: "Rol(len)", type: "multiselect", options: settings.roles, value: m.roles || [] },
    { id: "active", label: "Status", type: "select", options: ["Actief", "Inactief"], value: m.active ? "Actief" : "Inactief" },
    { id: "end_date", label: "Tot en met", type: "date", value: m.end_date ? m.end_date.split("T")[0] : "" },
  ], async (vals) => {
    try {
      vals.roles = Array.isArray(vals.roles) ? vals.roles : [];
      vals.active = vals.active === "Actief"; // ✅ converteer dropdown naar boolean

      const res = await fetch(`/api/members/${m.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
      if (!res.ok) throw new Error("Fout bij opslaan member");
      const updated = await res.json();
      Object.assign(m, updated);
      showToast("Member opgeslagen", "success");
      renderMembers();
    } catch (err) {
      console.error("❌ Member update error:", err);
      showToast("Fout bij opslaan member", "error");
    }
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
}

// ---------- Email Log, Leads, Offertes ----------
function renderEmailLog(){
  document.getElementById("emailLogList").innerHTML=
    tableHTML(["Aan","Onderwerp","Datum"],emailLog.map(e=>[e.to,e.subject,e.date]));
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
function renderSettings(){
  const blk=(title,arr,add,rem)=>`
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
  document.getElementById("typeServiceSettings").innerHTML=blk("Type Services",settings.typeServices,"addTypeService()","removeTypeService");
  document.getElementById("frequenciesSettings").innerHTML=blk("Frequenties",settings.frequencies,"addFrequency()","removeFrequency");
  document.getElementById("rolesSettings").innerHTML=blk("Rollen",settings.roles,"addRole()","removeRole");
  document.getElementById("tagsSettings").innerHTML=blk("Tags",settings.tags,"addTag()","removeTag");
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

  // Velden opbouwen
  fields.forEach(f => {
    const div = document.createElement("div");
    div.className = "form-field";
    if (f.hidden) div.style.display = "none";
    const label = document.createElement("label");
    label.textContent = f.label;
    let input;

    switch (f.type) {
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
        if (f.value) input.value = f.value;
        break;

      case "readonly":
        input = document.createElement("input");
        input.className = "input";
        input.name = f.id;
        input.readOnly = true;
        input.value = f.value || "";
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

  // 🔹 Toon/verberg bedrijfsvelden bij typeKlant = Zakelijk
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

    toggleBusinessFields(); // bij openen
    typeSelect.addEventListener("change", toggleBusinessFields);
  }

  // 🔹 Alleen tonen en activeren als onDelete bestaat
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

  // 🔹 Annuleren sluit modal
  card.querySelector("#cancel").onclick = () => overlay.remove();

  // 🔹 Opslaan verwerkt formulier
  form.onsubmit = async (e) => {
    e.preventDefault();

    const vals = {};
    fields.forEach(f => {
      if (f.type === "multiselect") {
        vals[f.id] = Array.from(
          form.querySelectorAll(`input[name='${f.id}']:checked`)
        ).map(x => x.value);
      } else {
        const inp = form.querySelector(`[name='${f.id}']`);
        vals[f.id] = inp ? inp.value : null;
      }
    });

    await onSave(vals);
    overlay.remove();
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
function tableHTML(headers, rows) {
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
            ${r.map(v => `<td class="border-b p-2">${v ?? ""}</td>`).join("")}
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
