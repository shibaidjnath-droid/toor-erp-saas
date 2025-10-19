// routes/clients.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

const router = express.Router();

/**
 * NOTE:
 * Deze router behandelt /api/clients maar schrijft naar de database-tabel 'contacts'.
 * Dit vervangt het oude routes/contacts.js-bestand.
 */

// ✅ GET alle klanten
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC");
    return res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen klanten:", err.message);
    return res.status(500).json({ error: "Databasefout bij ophalen klanten" });
  }
});

// ✅ GET klant per ID
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM contacts WHERE id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Klant niet gevonden" });
    return res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fout bij ophalen klant:", err.message);
    return res.status(500).json({ error: "Databasefout" });
  }
});

// ✅ POST nieuwe klant (optioneel met contract)
router.post("/", async (req, res) => {
  const {
    name, email, phone, address, houseNumber, city,
    typeKlant, bedrijfsnaam, kvk, btw, verzendMethode,
    status, contract_typeService, contract_frequency,
    contract_description, contract_priceInc, contract_vat,
    contract_lastVisit
  } = req.body;

  if (!name || !email)
    return res.status(400).json({ error: "Naam en e-mail zijn verplicht" });

  const clientId = uuidv4();

  try {
    // ✅ klant opslaan
    await pool.query(
      `INSERT INTO contacts
       (id, name, email, phone, address, house_number, city, type_klant,
        bedrijfsnaam, kvk, btw, verzend_methode, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,
      [
        clientId, name, email, phone || "", address || "", houseNumber || "", city || "",
        ["Particulier", "Zakelijk"].includes(typeKlant) ? typeKlant : "Particulier",
        typeKlant === "Zakelijk" ? (bedrijfsnaam || "") : "",
        typeKlant === "Zakelijk" ? (kvk || "") : "",
        typeKlant === "Zakelijk" ? (btw || "") : "",
        ["Whatsapp", "Email"].includes(verzendMethode) ? verzendMethode : "Email",
        status || "Active",
      ]
    );

    // ✅ contract aanmaken als velden aanwezig zijn
    let newContract = null;
    if (contract_typeService || contract_description) {
      const validServices = Array.isArray(contract_typeService)
        ? contract_typeService
        : [contract_typeService];
      const freq = contract_frequency || "Maand";
      const vat = isNaN(parseFloat(contract_vat)) ? 21 : parseFloat(contract_vat);
      const priceInc = isNaN(parseFloat(contract_priceInc))
        ? 0
        : parseFloat(contract_priceInc);
      const priceEx = +(priceInc / (1 + vat / 100)).toFixed(2);

      newContract = {
        id: uuidv4(),
        contact_id: clientId,
        type_service: validServices,
        frequency: freq,
        description: contract_description || "",
        price_ex: priceEx,
        price_inc: priceInc,
        vat_pct: vat,
        last_visit: contract_lastVisit || null,
        next_visit: new Date().toISOString(),
        active: true,
      };

      await pool.query(
        `INSERT INTO contracts
         (id, contact_id, type_service, frequency, description, price_ex, price_inc, vat_pct, last_visit, next_visit, active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
        [
          newContract.id, newContract.contact_id,
          JSON.stringify(newContract.type_service),
          newContract.frequency, newContract.description,
          newContract.price_ex, newContract.price_inc,
          newContract.vat_pct, newContract.last_visit,
          newContract.next_visit, newContract.active,
        ]
      );
    }

    return res.status(201).json({
      id: clientId,
      name,
      email,
      contractCreated: !!newContract,
    });
  } catch (err) {
    console.error("❌ Fout bij toevoegen klant:", err.message);
    return res.status(500).json({ error: "Databasefout bij toevoegen klant" });
  }
});

// ✅ PUT klant bijwerken
router.put("/:id", async (req, res) => {
  const id = req.params.id;
  const p = { ...req.body };

  try {
    const check = await pool.query("SELECT id FROM contacts WHERE id=$1", [id]);
    if (!check.rows.length) {
      return res.status(404).json({ error: "Client niet gevonden in database" });
    }

    const { rows } = await pool.query(
      `UPDATE contacts SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         address = COALESCE($4, address),
         house_number = COALESCE($5, house_number),
         city = COALESCE($6, city),
         type_klant = COALESCE($7, type_klant),
         bedrijfsnaam = COALESCE($8, bedrijfsnaam),
         kvk = COALESCE($9, kvk),
         btw = COALESCE($10, btw),
         verzend_methode = COALESCE($11, verzend_methode),
         status = COALESCE($12, status)
       WHERE id = $13
       RETURNING *`,
      [
        p.name, p.email, p.phone, p.address, p.houseNumber, p.city,
        p.typeKlant, p.bedrijfsnaam, p.kvk, p.btw, p.verzendMethode,
        p.status, id,
      ]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fout bij update klant:", err.message);
    return res.status(500).json({ error: "Databasefout bij update" });
  }
});

// ✅ PATCH: status toggelen
router.patch("/:id/toggle", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE contacts
         SET status = CASE WHEN status='Active' THEN 'Inactive' ELSE 'Active' END
       WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Client niet gevonden" });
    return res.json({ message: `Status gewijzigd naar ${rows[0].status}`, client: rows[0] });
  } catch (err) {
    console.error("❌ Fout bij togglen status:", err.message);
    return res.status(500).json({ error: "Databasefout bij statuswijziging" });
  }
});

export default router;
