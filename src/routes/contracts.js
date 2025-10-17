// routes/contracts.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contacts } from './contacts.js';
import { serviceTypes } from './serviceTypes.js';

const router = express.Router();
export let contracts = []; // ✅ explicit named export


// Geldige frequenties
const allowedFreq = [
  "3 weken", "4 weken", "6 weken", "8 weken", "12 weken",
  "Maand", "3 keer per jaar", "1 keer per jaar"
];

// Hulpfunctie voor berekenen volgende bezoek
function computeNextVisit(lastVisit, frequency) {
  const base = lastVisit ? new Date(lastVisit) : new Date();
  const d = new Date(base);
  switch (frequency) {
    case "3 weken": d.setDate(d.getDate() + 21); break;
    case "4 weken": d.setDate(d.getDate() + 28); break;
    case "6 weken": d.setDate(d.getDate() + 42); break;
    case "8 weken": d.setDate(d.getDate() + 56); break;
    case "12 weken": d.setDate(d.getDate() + 84); break;
    case "Maand": d.setMonth(d.getMonth() + 1); break;
    case "3 keer per jaar": d.setMonth(d.getMonth() + 4); break;
    case "1 keer per jaar": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

/** ✅ GET – alle contracts */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, ct.name AS client_name
       FROM contracts c
       LEFT JOIN contacts ct ON c.contact_id = ct.id
       ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/** ✅ GET – één contract */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, ct.name AS client_name
       FROM contracts c
       LEFT JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/** ✅ POST – nieuw contract */
router.post("/", async (req, res) => {
  try {
    const {
      clientId, frequency, description, paymentNotes,
      priceEx, vatPct, groteBeurt, typeService = [],
      lastVisit
    } = req.body;

    if (!clientId) return res.status(400).json({ error: "clientId is verplicht" });

    // Check of client bestaat
    const clientCheck = await pool.query("SELECT id FROM contacts WHERE id=$1", [clientId]);
    if (!clientCheck.rows.length)
      return res.status(404).json({ error: "Client niet gevonden" });

    // Berekeningen
    const freq = allowedFreq.includes(frequency) ? frequency : "Maand";
    const ex = isNaN(parseFloat(priceEx)) ? 0 : parseFloat(priceEx);
    const vat = isNaN(parseFloat(vatPct)) ? 21 : parseFloat(vatPct);
    const inc = +(ex * (1 + vat / 100)).toFixed(2);
    const nextVisit = computeNextVisit(lastVisit, freq);

    // Insert
    const { rows } = await pool.query(
      `INSERT INTO contracts (
        contact_id, frequency, description, payment_notes,
        price_ex, price_inc, vat_pct, grote_beurt, type_service,
        last_visit, next_visit, active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
      RETURNING *`,
      [
        clientId, freq, description || "", paymentNotes || "",
        ex, inc, vat, !!groteBeurt, typeService, lastVisit || null, nextVisit
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error:", err);
    res.status(500).json({ error: "Database insert error" });
  }
});

/** ✅ PUT – update contract */
router.put("/:id", async (req, res) => {
  try {
    const {
      frequency, description, paymentNotes,
      priceEx, vatPct, groteBeurt, typeService,
      lastVisit, active
    } = req.body;

    // Berekeningen
    const freq = allowedFreq.includes(frequency) ? frequency : undefined;
    const ex = priceEx !== undefined ? parseFloat(priceEx) : undefined;
    const vat = vatPct !== undefined ? parseFloat(vatPct) : undefined;
    const nextVisit = (lastVisit || freq)
      ? computeNextVisit(lastVisit, freq || "Maand")
      : undefined;

    const { rows } = await pool.query(
      `UPDATE contracts
       SET frequency = COALESCE($1, frequency),
           description = COALESCE($2, description),
           payment_notes = COALESCE($3, payment_notes),
           price_ex = COALESCE($4, price_ex),
           vat_pct = COALESCE($5, vat_pct),
           price_inc = CASE
             WHEN $4 IS NOT NULL AND $5 IS NOT NULL THEN ROUND($4 * (1 + $5/100), 2)
             ELSE price_inc
           END,
           grote_beurt = COALESCE($6, grote_beurt),
           type_service = COALESCE($7, type_service),
           last_visit = COALESCE($8, last_visit),
           next_visit = COALESCE($9, next_visit),
           active = COALESCE($10, active)
       WHERE id = $11
       RETURNING *`,
      [freq, description, paymentNotes, ex, vat, groteBeurt, typeService, lastVisit, nextVisit, active, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB update error:", err);
    res.status(500).json({ error: "Database update error" });
  }
});

/** ✅ PATCH – bezoek registreren */
router.patch("/:id/visit", async (req, res) => {
  try {
    const { date } = req.body;
    const when = date ? new Date(date).toISOString() : new Date().toISOString();

    const contract = await pool.query("SELECT frequency FROM contracts WHERE id=$1", [req.params.id]);
    if (!contract.rows.length) return res.status(404).json({ error: "Contract niet gevonden" });

    const nextVisit = computeNextVisit(when, contract.rows[0].frequency);

    const { rows } = await pool.query(
      `UPDATE contracts
       SET last_visit=$1, next_visit=$2
       WHERE id=$3 RETURNING *`,
      [when, nextVisit, req.params.id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Visit update error:", err);
    res.status(500).json({ error: "Update visit failed" });
  }
});

/** ✅ PATCH – handmatige override van nextVisit */
router.patch("/:id/override", async (req, res) => {
  try {
    const { nextVisit } = req.body;
    if (!nextVisit) return res.status(400).json({ error: "nextVisit verplicht (ISO string)" });

    const { rows } = await pool.query(
      `UPDATE contracts SET next_visit=$1 WHERE id=$2 RETURNING *`,
      [new Date(nextVisit).toISOString(), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Override error:", err);
    res.status(500).json({ error: "Override update failed" });
  }
});

export default router;
