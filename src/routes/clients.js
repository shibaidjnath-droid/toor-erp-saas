// routes/clients.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";          // ✅ DB connectie toegevoegd
import { contracts } from "./contracts.js";

const router = express.Router();
export let clients = []; // blijft bestaan als fallback

/**
 * Client structuur:
 * {
 *   id, name, email, phone, address, houseNumber, city,
 *   typeKlant: 'Particulier' | 'Zakelijk',
 *   bedrijfsnaam?, kvk?, btw?,
 *   verzendMethode: 'Whatsapp' | 'Email',
 *   status, createdAt
 * }
 */

// ✅ GET alle klanten (eerst uit DB, fallback op in-memory)
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM contacts ORDER BY created_at DESC"
    );
    if (rows.length) return res.json(rows);
  } catch (err) {
    console.warn("⚠️ Fallback naar in-memory clients:", err.message);
  }
  res.json(clients);
});

// ✅ GET klant per ID
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM contacts WHERE id=$1",
      [req.params.id]
    );
    if (rows.length) return res.json(rows[0]);
  } catch (err) {
    console.warn("⚠️ Fallback get/:id:", err.message);
  }

  const c = clients.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: "Client niet gevonden" });
  res.json(c);
});

// ✅ POST nieuwe klant (optioneel met contract)
router.post("/", async (req, res) => {
  const {
    name, email, phone, address, houseNumber, city,
    typeKlant, bedrijfsnaam, kvk, btw, verzendMethode,
    status, // optioneel
    contract_typeService, contract_frequency, contract_description,
    contract_priceInc, contract_vat, contract_lastVisit
  } = req.body;

  if (!name || !email)
    return res.status(400).json({ error: "Naam en e-mail zijn verplicht" });
  
  const client = {
    id: uuidv4(),
    name,
    email,
    phone: phone || "",
    address: address || "",
    houseNumber: houseNumber || "",
    city: city || "",
    typeKlant: ["Particulier", "Zakelijk"].includes(typeKlant)
      ? typeKlant
      : "Particulier",
    verzendMethode: ["Whatsapp", "Email"].includes(verzendMethode)
      ? verzendMethode
      : "Email",
    bedrijfsnaam: typeKlant === "Zakelijk" ? (bedrijfsnaam || "") : "",
    kvk: typeKlant === "Zakelijk" ? (kvk || "") : "",
    btw: typeKlant === "Zakelijk" ? (btw || "") : "",
    status: status || "Active",
    createdAt: new Date(),
  };

  // ✅ Probeer eerst op te slaan in database
  try {
    await pool.query(
      `INSERT INTO contacts 
        (id, name, email, phone, address, house_number, city, type_klant,
         bedrijfsnaam, kvk, btw, verzend_methode, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,
      [
        client.id, client.name, client.email, client.phone,
        client.address, client.houseNumber, client.city,
        client.typeKlant, client.bedrijfsnaam, client.kvk, client.btw,
        client.verzendMethode, client.status,
      ]
    );
  } catch (err) {
    console.warn("⚠️ DB insert mislukt, gebruik fallback:", err.message);
    clients.push(client);
  }

  // --- Indien contractvelden zijn ingevuld ---
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
      contactId: client.id,
      typeService: validServices,
      frequency: freq,
      description: contract_description || "",
      priceEx,
      priceInc,
      vatPct: vat,
      lastVisit: contract_lastVisit || null,
      nextVisit: new Date().toISOString(),
      active: true,
      createdAt: new Date(),
    };

    contracts.push(newContract);
    console.log(`Nieuw contract aangemaakt voor klant ${client.name}`);
  }

  res.status(201).json({
    ...client,
    contractCreated: !!newContract,
  });
});

// ✅ PUT klant bijwerken
router.put("/:id", async (req, res) => {
  const p = { ...req.body };

  if (p.typeKlant && !["Particulier", "Zakelijk"].includes(p.typeKlant))
    delete p.typeKlant;
  if (p.verzendMethode && !["Whatsapp", "Email"].includes(p.verzendMethode))
    delete p.verzendMethode;

  // Alleen zakelijke velden behouden bij type 'Zakelijk'
  if (p.typeKlant === "Particulier") {
    p.bedrijfsnaam = "";
    p.kvk = "";
    p.btw = "";
  }

  try {
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
        p.status, req.params.id,
      ]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Client niet gevonden" });

    return res.json(rows[0]);
  } catch (err) {
    console.warn("⚠️ Fallback update:", err.message);
    const idx = clients.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Client niet gevonden" });
    clients[idx] = { ...clients[idx], ...p };
    return res.json(clients[idx]);
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
    return res.json({
      message: `Status gewijzigd naar ${rows[0].status}`,
      client: rows[0],
    });
  } catch (err) {
    console.warn("⚠️ Fallback toggle:", err.message);
    const c = clients.find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Client niet gevonden" });
    c.status = c.status === "Active" ? "Inactive" : "Active";
    res.json({ message: `Status gewijzigd naar ${c.status}`, client: c });
  }
});

export default router;
