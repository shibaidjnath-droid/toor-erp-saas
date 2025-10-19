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
  { id: 1, name: "Kristal Helder BV", email: "info@kristalhelder.nl", phone: "010-1234567", street: "Hoofdstraat", houseNumber: "12A", city: "Rotterdam", tag: "Zakelijk" },
  { id: 2, name: "Glansrijk Schoon", email: "contact@glansrijk.nl", phone: "06-12345678", street: "Dorpsweg", houseNumber: "88", city: "Capelle a/d IJssel", tag: "VvE" },
  { id: 3, name: "Schoonzicht BV", email: "info@schoonzicht.nl", phone: "010-5558888", street: "Laan van Zuid", houseNumber: "5", city: "Schiedam", tag: "Zakelijk" },
  { id: 4, name: "Jan Jansen", email: "jan@example.com", phone: "06-99999999", street: "Kerklaan", houseNumber: "9", city: "Vlaardingen", tag: "Particulier" },
];

let contracts = [
  { id: 1, clientId: 1, typeService: ["Glasbewassing"], frequency: "Maandelijks", description: "Ramen en kozijnen wassen", price: 120, vat: 21, lastVisit: "2025-09-25" },
  { id: 2, clientId: 2, typeService: ["Schoonmaak"], frequency: "Kwartaal", description: "Volledige kantoorreiniging", price: 450, vat: 21, lastVisit: "2025-07-15" },
  { id: 3, clientId: 4, typeService: ["Tuinonderhoud"], frequency: "Wekelijks", description: "Grasmaaien en snoeiwerk", price: 60, vat: 9, lastVisit: "2025-10-10" },
];

let planning = [
  { id: 1, contractId: 1, date: "2025-10-25", status: "Gepland" },
  { id: 2, contractId: 3, date: "2025-10-17", status: "Gepland" },
  { id: 3, contractId: 2, date: "2025-10-20", status: "Uitgevoerd" },
];

let invoices = [
  { id: 1, contractId: 1, clientId: 1, amount: 145.2, date: "2025-09-30", status: "Betaald" },
  { id: 2, contractId: 2, clientId: 2, amount: 544.5, date: "2025-10-01", status: "Open" },
  { id: 3, contractId: 3, clientId: 4, amount: 65.4, date: "2025-10-05", status: "Betaald" },
];

let members = [
  { id: 1, name: "Pieter de Vries", email: "pieter@bedrijf.nl", phone: "06-12312312", role: ["Schoonmaker"] },
  { id: 2, name: "Sanne Bakker", email: "sanne@bedrijf.nl", phone: "06-22222222", role: ["Teamleider"] },
  { id: 3, name: "Mark Visser", email: "mark@bedrijf.nl", phone: "06-33333333", role: ["Planner"] },
];

let emailLog = [
  { id: 1, to: "klant@example.com", subject: "Factuur September", date: "2025-09-30" },
  { id: 2, to: "contact@glansrijk.nl", subject: "Planning update", date: "2025-10-05" },
];

let leads = [
  { id: 1, name: "Eva Koster", email: "eva@voorbeeld.nl", phone: "06-11111111", source: "Website" },
  { id: 2, name: "Tom Bos", email: "tom@bedrijf.nl", phone: "06-22222222", source: "Telefonisch" },
];

let quotes = [
  { id: 1, title: "Offerte Glasbewassing", contact: "Kristal Helder BV", amount: 250, status: "Concept" },
  { id: 2, title: "Offerte Kantoor reiniging", contact: "Glansrijk Schoon", amount: 480, status: "Verzonden" },
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
    c.typeKlant,
    c.verzendMethode,
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
      { id: "contract_typeService", label: "Contract: Type Service", type: "multiselect", options: settings.typeServices }, // ✅ multiselect
      { id: "contract_frequency", label: "Contract: Frequentie", type: "select", options: settings.frequencies },
      { id: "contract_description", label: "Contract: Beschrijving" },
      { id: "contract_priceInc", label: "Contract: Prijs incl. (€)" },
      { id: "contract_vat", label: "Contract: BTW (%)", type: "select", options: ["21", "9", "0"], value: "21" },
      { id: "contract_lastVisit", label: "Contract: Laatste bezoek", type: "date" },
    ], async (vals) => {
      try {
        // Zakelijke velden tonen indien nodig
        if (vals.typeKlant === "Zakelijk") {
          document.querySelector(`[name="bedrijfsnaam"]`).parentElement.style.display = "block";
          document.querySelector(`[name="kvk"]`).parentElement.style.display = "block";
          document.querySelector(`[name="btw"]`).parentElement.style.display = "block";
        }

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
}


function openClientDetail(c) {
  openModal(`Klant bewerken – ${c.name}`, [
    { id: "id", label: "Klant ID", value: c.id, readonly: true },
    { id: "name", label: "Naam", value: c.name },
    { id: "email", label: "E-mail", value: c.email },
    { id: "phone", label: "Telefoon", value: c.phone },
    { id: "address", label: "Adres", value: c.address },
    { id: "houseNumber", label: "Huisnummer", value: c.houseNumber },
    { id: "city", label: "Plaats", value: c.city },
    { id: "typeKlant", label: "Type Klant", type: "select", options: ["Particulier", "Zakelijk"], value: c.typeKlant },
    { id: "bedrijfsnaam", label: "Bedrijfsnaam", value: c.bedrijfsnaam || "", hidden: c.typeKlant !== "Zakelijk" },
    { id: "kvk", label: "KvK", value: c.kvk || "", hidden: c.typeKlant !== "Zakelijk" },
    { id: "btw", label: "BTW", value: c.btw || "", hidden: c.typeKlant !== "Zakelijk" },
    { id: "verzendMethode", label: "Verzendmethode", type: "select", options: ["Whatsapp", "Email"], value: c.verzendMethode },
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
function renderContracts(){
  const list=document.getElementById("contractsList");
  const rows=contracts.map(c=>{
    const client=clients.find(cl=>cl.id===c.clientId)?.name||"Onbekend";
    const next=calcNextVisit(c.lastVisit,c.frequency);
    return [client,c.typeService.join(", "),c.frequency,
      c.description,`€${c.price.toFixed(2)}`,`${c.vat}%`,c.lastVisit,next];
  });
  list.innerHTML=tableHTML(["Klant","Type service","Frequentie","Beschrijving","Prijs incl.","BTW %","Laatste bezoek","Volgende bezoek"],rows);
  list.querySelectorAll("tbody tr").forEach((tr,i)=>
    tr.addEventListener("click",()=>openContractDetail(contracts[i])));
  document.getElementById("newContractBtn").onclick=()=>openModal("Nieuw Contract",[
    {id:"client",label:"Klant",type:"select",options:clients.map(c=>c.name)},
    {id:"typeService",label:"Type service",type:"multiselect",options:settings.typeServices},
    {id:"frequency",label:"Frequentie",type:"select",options:settings.frequencies},
    {id:"description",label:"Beschrijving"},{id:"price",label:"Prijs incl."},
    {id:"vat",label:"BTW %",type:"select",options:["21","9","0"]},
    {id:"lastVisit",label:"Laatste bezoek",type:"date"},
  ],vals=>{
    const client=clients.find(c=>c.name===vals.client);
    contracts.push({
      id:Date.now(),clientId:client?.id,typeService:vals.typeService,
      frequency:vals.frequency,description:vals.description,
      price:parseFloat(vals.price||0),vat:parseInt(vals.vat),lastVisit:vals.lastVisit
    });
    showToast("Contract toegevoegd","success");renderContracts();
  });
}

function openContractDetail(c){
  const client=clients.find(x=>x.id===c.clientId);
  openModal(`Contract bewerken – ${client?.name||"Onbekend"}`,[
    {id:"client",label:"Klant",type:"select",options:clients.map(c=>c.name),value:client?.name},
    {id:"typeService",label:"Type service",type:"multiselect",options:settings.typeServices,value:c.typeService},
    {id:"frequency",label:"Frequentie",type:"select",options:settings.frequencies,value:c.frequency},
    {id:"description",label:"Beschrijving",value:c.description},
    {id:"price",label:"Prijs incl.",value:c.price},
    {id:"vat",label:"BTW %",type:"select",options:["21","9","0"],value:c.vat},
    {id:"lastVisit",label:"Laatste bezoek",type:"date",value:c.lastVisit},
  ],vals=>{
    Object.assign(c,{
      clientId:clients.find(x=>x.name===vals.client)?.id,
      typeService:vals.typeService,frequency:vals.frequency,
      description:vals.description,price:parseFloat(vals.price||0),
      vat:parseInt(vals.vat),lastVisit:vals.lastVisit
    });
    showToast("Contract opgeslagen","success");renderContracts();
  },()=>confirmDelete("contract",()=>{
    contracts=contracts.filter(x=>x.id!==c.id);
    renderContracts();showToast("Contract verwijderd","success");
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

// ---------- Members ----------
function renderMembers(){
  const list=document.getElementById("membersList");
  list.innerHTML=tableHTML(["Naam","E-mail","Telefoon","Rol"],
    members.map(m=>[m.name,m.email,m.phone,m.role.join(", ")]));
  list.querySelectorAll("tbody tr").forEach((tr,i)=>
    tr.addEventListener("click",()=>openMemberDetail(members[i])));
  document.getElementById("newMemberBtn").onclick=()=>openModal("Nieuwe Member",[
    {id:"name",label:"Naam"},{id:"email",label:"E-mail"},
    {id:"phone",label:"Telefoon"},
    {id:"role",label:"Rol",type:"multiselect",options:settings.roles},
  ],vals=>{
    members.push({id:Date.now(),...vals});
    showToast("Member toegevoegd","success");renderMembers();
  });
}
function openMemberDetail(m){
  openModal(`Member bewerken – ${m.name}`,[
    {id:"name",label:"Naam",value:m.name},
    {id:"email",label:"E-mail",value:m.email},
    {id:"phone",label:"Telefoon",value:m.phone},
    {id:"role",label:"Rol",type:"multiselect",options:settings.roles,value:m.role},
  ],vals=>{
    Object.assign(m,vals);
    showToast("Member opgeslagen","success");renderMembers();
  },()=>confirmDelete("member",()=>{
    members=members.filter(x=>x.id!==m.id);
    renderMembers();showToast("Member verwijderd","success");
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
    if (f.hidden) return;
    const div = document.createElement("div");
    div.className = "form-field";
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

  if (onDelete) card.querySelector("#delBtn").classList.remove("hidden");

  card.querySelector("#cancel").onclick = () => overlay.remove();
  card.querySelector("#delBtn").onclick = () => {
    confirmDelete("record", () => {
      onDelete();
      overlay.remove();
    });
  };

  form.onsubmit = async (e) => {
    e.preventDefault();

    const vals = {};
    fields.forEach(f => {
      if (f.type === "multiselect") {
        vals[f.id] = Array.from(form.querySelectorAll(`input[name='${f.id}']:checked`)).map(x => x.value);
      } else {
        const inp = form.querySelector(`[name='${f.id}']`);
        vals[f.id] = inp ? inp.value : null;
      }
    });

    await onSave(vals);
    overlay.remove();
  };
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
