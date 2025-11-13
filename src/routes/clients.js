// routes/clients.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { computeNextVisit } from "./contracts.js"; // hergebruik hulpfunctie indien export aanwezig
import { rebuildSeriesForContract, cancelPlanningForClient } from "./planningHelpers.js";

const router = express.Router();

/** ✅ GET – alle klanten */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen klanten:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

/** ✅ POST – nieuwe klant + automatisch contract + planning */
router.post("/", async (req, res) => {
  const client = req.body;
  console.log("🧾 Nieuwe klant payload:", client);

  const clientId = uuidv4();
  const contractId = uuidv4();

  try {
    // --- 1️⃣ Klant aanmaken ---
    // ✅ Veiligheidscheck — garandeert altijd geldige JSON-array
    let safeTag = [];
    try {
      if (Array.isArray(client.tag)) {
        safeTag = client.tag;
      } else if (typeof client.tag === "string" && client.tag.trim() !== "") {
        safeTag = [client.tag];
      } else {
        safeTag = [];
      }
    } catch {
      safeTag = [];
    }
    const safeTypeKlant = client.typeKlant || "Onbekend";
    const safeVerzendMethode = client.verzendMethode || "Email";

    const insertClient = `
      INSERT INTO contacts (
        id, name, email, phone, address, house_number, postcode, city,
        type_klant, bedrijfsnaam, kvk, btw, verzend_methode, tag,
        facturatie, status, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Active',now())
      RETURNING *;
    `;

    const clientValues = [
      clientId,
      client.name || "",
      client.email || "",
      client.phone || "",
      client.address || "",
      client.houseNumber || "",
      client.postcode || "",
      client.city || "",
      safeTypeKlant,
      client.bedrijfsnaam || "",
      client.kvk || "",
      client.btw || "",
      safeVerzendMethode,
      JSON.stringify(safeTag), // FIXED: altijd als string opslaan
      client.facturatie || "",
    ];
    console.log("🔍 tag value before insert:", JSON.stringify(safeTag));

    const { rows: newClientRows } = await pool.query(insertClient, clientValues);
    const newClient = newClientRows[0];
    console.log(`✅ Klant toegevoegd: ${newClient.name}`);

    // --- 2️⃣ Contract aanmaken (indien aanwezig in payload) ---
    if (client.contract_frequency && client.contract_typeService) {
      // ✅ Veiligheidscheck — garandeert altijd geldige JSON-array voor type_service
      let safeServices = [];
      try {
        if (Array.isArray(client.contract_typeService)) {
          safeServices = client.contract_typeService;
        } else if (
          typeof client.contract_typeService === "string" &&
          client.contract_typeService.trim() !== ""
        ) {
          safeServices = [client.contract_typeService];
        } else {
          safeServices = [];
        }
      } catch {
        safeServices = [];
      }

    // ✅ Bereken next_visit op basis van logica “verleden of toekomst”
let nextVisit = null;
if (client.contract_lastVisit) {
  try {
    const base = new Date(client.contract_lastVisit);
    const now = new Date();

    if (base >= now) {
      // Toekomstige datum → gebruik als eerste planningdatum
      nextVisit = base.toISOString();
      console.log("📅 Eerste planning = opgegeven toekomstige datum:", nextVisit);
    } else {
      // Verleden datum → bereken volgende volgens frequentie
      nextVisit = computeNextVisit
        ? computeNextVisit(base, client.contract_frequency)
        : base.toISOString();
      console.log("📅 Eerste planning = berekend op basis van frequentie:", nextVisit);
    }
  } catch {
    nextVisit = new Date().toISOString();
  }
}
// ✅ Automatisch beschrijving vullen op basis van contract_typeService (alleen als leeg)
if ((!client.contract_description || !client.contract_description.trim()) && safeServices.length) {
  client.contract_description = safeServices.join(", ");
}

      const insertContract = `
        INSERT INTO contracts (
          id, contact_id, frequency, description,
          price_inc, vat_pct, type_service,
          last_visit, next_visit, active, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now())
        RETURNING *;
      `;

      const contractValues = [
        contractId,
        clientId,
        client.contract_frequency,
        client.contract_description || "",
        parseFloat(client.contract_priceInc) || 0,
        client.contract_vat !== undefined && client.contract_vat !== ""
          ? parseFloat(client.contract_vat)
          : 21,
        JSON.stringify(safeServices), // ✅ JSON-veilig
        client.contract_lastVisit || null,
        nextVisit,
      ];

      const { rows: newContractRows } = await pool.query(insertContract, contractValues);
      const newContract = newContractRows[0];
      console.log(`✅ Contract aangemaakt voor klant: ${newClient.name}`);

      // --- 3️⃣ Automatisch eerste planningrecord (optioneel) ---
      if (newContract && newContract.next_visit) {
        // ✅ Eerste planningrecord aanmaken en auto-assign starten
        const { rows: pRows } = await pool.query(
          `INSERT INTO planning (id, contract_id, date, status, created_at)
           VALUES ($1,$2,$3,'Gepland',now())
           RETURNING id`,
          [uuidv4(), contractId, newContract.next_visit]
        );

        // 🔁 Slimme member-toewijzing via Smart Planning Engine (niet blocking)
        try {
          await fetch(`${process.env.APP_URL}/api/planning/auto-assign/${pRows[0].id}`, {
            method: "POST",
          });
        } catch (e) {
          console.warn("Auto-assign call failed:", e.message);
        }

        console.log(`📅 Eerste planningrecord aangemaakt voor ${newClient.name}`);

        // ✅ 12 maanden planning automatisch genereren
        await rebuildSeriesForContract(contractId, {
  resetExisting: true,
  startDate: newContract.next_visit,
  logPrefix: "AUTO from client insert – "
});
try {
  // 🔁 Slimme auto-assigner opnieuw laten lopen voor de nieuwe reeks
  const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;
await fetch(`${baseUrl}/api/planning/auto-assign/contract/${contractId}`, {
  method: "POST",
});

  console.log(`🧠 Auto-assign gestart voor contract ${contractId}`);
} catch (e) {
  console.warn("Auto-assign call after rebuild failed:", e.message);
}

      }
    }

    res.status(201).json({ ok: true, clientId });
  } catch (err) {
    console.error("❌ Fout bij toevoegen klant:", err.message);
    console.error("❌ Stacktrace:", err);
    res.status(500).json({ error: "Fout bij toevoegen klant" });
  }
});

/** ✅ PUT – klant updaten */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const c = req.body;

    const safeTag = Array.isArray(c.tag) ? c.tag : [c.tag].filter(Boolean);

    const update = `
      UPDATE contacts
      SET name=$1, email=$2, phone=$3, address=$4,
          house_number=$5, city=$6, type_klant=$7,
          bedrijfsnaam=$8, kvk=$9, btw=$10,
          verzend_methode=$11, tag=$12, facturatie=$13,
          status=$14, postcode=$15
      WHERE id=$16
      RETURNING *;
    `;

    const vals = [
      c.name,
      c.email,
      c.phone,
      c.address,
      c.houseNumber,
      c.city,
      c.typeKlant,
      c.bedrijfsnaam,
      c.kvk,
      c.btw,
      c.verzendMethode,
      JSON.stringify(safeTag), // FIXED: consistent met insert
      c.facturatie,
      c.status || "Active",
      c.postcode,
      id,
    ];

    const { rows } = await pool.query(update, vals);
    if (!rows.length) return res.status(404).json({ error: "Klant niet gevonden" });

    // FIXED: verkeerde scope en variabele (vals → c en id)
   if (c.status === "Inactive") {
  // ✅ Alleen twee geldige redenen voor contract-stop
  const reason =
    c.cancel_reason === "Contract stop gezet door ons"
      ? "Contract stop gezet door ons"
      : "Contract stop gezet door klant";

  await cancelPlanningForClient(id, reason);
}


    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fout bij updaten klant:", err.message);
    res.status(500).json({ error: "Update mislukt" });
  }
});

export default router;
