// routes/clients.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { computeNextVisit } from "./contracts.js"; // hergebruik hulpfunctie indien export aanwezig

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
        id, name, email, phone, address, house_number, city,
        type_klant, bedrijfsnaam, kvk, btw, verzend_methode, tag,
        facturatie, status, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Active',now())
      RETURNING *;
    `;

    const clientValues = [
      clientId,
      client.name || "",
      client.email || "",
      client.phone || "",
      client.address || "",
      client.houseNumber || "",
      client.city || "",
      safeTypeKlant,
      client.bedrijfsnaam || "",
      client.kvk || "",
      client.btw || "",
      safeVerzendMethode,
      JSON.stringify(safeTag),
      client.facturatie || "",
    ];
console.log("🔍 tag value before insert:", JSON.stringify(safeTag));

    const { rows: newClientRows } = await pool.query(insertClient, clientValues);
    const newClient = newClientRows[0];
    console.log(`✅ Klant toegevoegd: ${newClient.name}`);

    // --- 2️⃣ Contract aanmaken (indien aanwezig in payload) ---
    if (client.contract_frequency && client.contract_typeService) {
      const safeServices = Array.isArray(client.contract_typeService)
        ? client.contract_typeService
        : [client.contract_typeService].filter(Boolean);

      // bereken next_visit
      let nextVisit = null;
      if (client.contract_lastVisit) {
        try {
          const base = new Date(client.contract_lastVisit);
          nextVisit = computeNextVisit
            ? computeNextVisit(base, client.contract_frequency)
            : base.toISOString(); // fallback
        } catch {
          nextVisit = new Date().toISOString();
        }
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
        parseFloat(client.contract_vat) || 21,
        safeServices, // ✅ geen JSON.stringify()
        client.contract_lastVisit || null,
        nextVisit,
      ];

      const { rows: newContractRows } = await pool.query(insertContract, contractValues);
      const newContract = newContractRows[0];
      console.log(`✅ Contract aangemaakt voor klant: ${newClient.name}`);

      // --- 3️⃣ Automatisch eerste planningrecord (optioneel) ---
      if (newContract && newContract.next_visit) {
        await pool.query(
          `INSERT INTO planning (id, contract_id, date, status, created_at)
           VALUES ($1,$2,$3,'Gepland',now())`,
          [uuidv4(), contractId, newContract.next_visit]
        );
        console.log(`📅 Eerste planningrecord aangemaakt voor ${newClient.name}`);
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
          status=$14
      WHERE id=$15
      RETURNING *;
    `;

    const vals = [
      c.name, c.email, c.phone, c.address,
      c.houseNumber, c.city, c.typeKlant,
      c.bedrijfsnaam, c.kvk, c.btw,
      c.verzendMethode, safeTag, c.facturatie,
      c.status || "Active", id
    ];

    const { rows } = await pool.query(update, vals);
    if (!rows.length) return res.status(404).json({ error: "Klant niet gevonden" });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fout bij updaten klant:", err.message);
    res.status(500).json({ error: "Update mislukt" });
  }
});

export default router;
