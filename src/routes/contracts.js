// routes/contracts.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

const router = express.Router();

// Geldige frequenties
const allowedFreq = [
  "3 weken", "4 weken", "6 weken", "8 weken", "12 weken",
  "Maand", "3 keer per jaar", "1 keer per jaar"
];

// Hulpfunctie voor berekenen volgende bezoek
export function computeNextVisit(lastVisit, frequency) {
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

/** ✅ GET – alle contracts (inclusief klantadresgegevens) */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        c.*,
        ct.name AS client_name,
        ct.address AS address,
        ct.house_number AS house_number,
        ct.city AS city
      FROM contracts c
      LEFT JOIN contacts ct ON c.contact_id = ct.id
      ORDER BY ct.name ASC
    `);

    const parsed = rows.map(r => ({
      ...r,
      type_service:
        typeof r.type_service === "string"
          ? JSON.parse(r.type_service)
          : r.type_service
    }));

    res.json(parsed);
  } catch (err) {
    console.error("❌ DB error (GET /contracts):", err.message);
    res.status(500).json({ error: "Database error bij ophalen contracts" });
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
    if (!rows.length)
      return res.status(404).json({ error: "Contract niet gevonden" });

    const r = rows[0];
    if (typeof r.type_service === "string")
      r.type_service = JSON.parse(r.type_service);

    res.json(r);
  } catch (err) {
    console.error("❌ DB error:", err.message);
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

    if (!clientId)
      return res.status(400).json({ error: "clientId is verplicht" });

    const clientCheck = await pool.query("SELECT id FROM contacts WHERE id=$1", [clientId]);
    if (!clientCheck.rows.length)
      return res.status(404).json({ error: "Client niet gevonden" });

    const freq = allowedFreq.includes(frequency) ? frequency : "Maand";
    const ex = isNaN(parseFloat(priceEx)) ? 0 : parseFloat(priceEx);
    const vat = isNaN(parseFloat(vatPct)) ? 21 : parseFloat(vatPct);
    const inc = +(ex * (1 + vat / 100)).toFixed(2);
    const nextVisit = computeNextVisit(lastVisit, freq);
    const id = uuidv4();

    const { rows } = await pool.query(
      `INSERT INTO contracts (
        id, contact_id, frequency, description, payment_notes,
        price_ex, price_inc, vat_pct, grote_beurt, type_service,
        last_visit, next_visit, active, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,now())
      RETURNING *`,
      [
        id, clientId, freq, description || "", paymentNotes || "",
        ex, inc, vat, !!groteBeurt, JSON.stringify(typeService),
        lastVisit || null, nextVisit
      ]
    );

    const contract = rows[0];

    // ✅ Automatisch planningrecord (alleen als next_visit <= vandaag)
   if (contract.next_visit) {
      try {
        const existing = await pool.query(
          "SELECT id FROM planning WHERE contract_id=$1 AND date::date=$2::date",
          [contract.id, contract.next_visit]
        );
        if (!existing.rowCount) {
          await pool.query(
            `INSERT INTO planning (id, contract_id, date, status, created_at)
             VALUES ($1,$2,$3,'Gepland',now())`,
            [uuidv4(), contract.id, contract.next_visit]
          );
          console.log(`✅ Planningrecord aangemaakt voor nieuw contract ${contract.id}`);
        }
      } catch (err) {
        console.error("❌ Fout bij automatisch planningrecord (POST):", err.message);
      }
    }

    if (typeof contract.type_service === "string")
      contract.type_service = JSON.parse(contract.type_service);

    res.status(201).json(contract);
  } catch (err) {
    console.error("❌ DB insert error:", err.message);
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

    const freq = allowedFreq.includes(frequency) ? frequency : undefined;
    const ex = priceEx !== undefined ? parseFloat(priceEx) : undefined;
    const vat = vatPct !== undefined ? parseFloat(vatPct) : undefined;
    const nextVisit =
      (lastVisit || freq)
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
      [
        freq, description, paymentNotes, ex, vat, groteBeurt,
        JSON.stringify(typeService), lastVisit, nextVisit, active, req.params.id
      ]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Contract niet gevonden" });

    const contract = rows[0];

    // ✅ Slimme initiële planning (minimaal 12 maanden vooruit)
try {
  const freq = contract.frequency || "Maand";
  const { computeNextVisit } = await import("./contracts.js");

  // 1️⃣ Startdatum bepalen
  const now = new Date();
  let start;
  if (contract.next_visit && new Date(contract.next_visit) > now) {
    // toekomstig: begin op de ingevulde startdatum
    start = new Date(contract.next_visit);
  } else if (contract.last_visit) {
    // historisch: eerste afspraak = volgende na laatste bezoek
    start = new Date(computeNextVisit(contract.last_visit, freq));
  } else {
    start = now;
  }

  // 2️⃣ Helpers (kleine kopie uit planning.js)
  async function hasConflict(date, memberId, contractId) {
    const { rows } = await pool.query(
      `SELECT 1 FROM planning
       WHERE date::date = $1::date
         AND (member_id = $2 OR contract_id = $3)
       LIMIT 1`,
      [date.toISOString(), memberId, contractId]
    );
    return rows.length > 0;
  }

  async function findBestWorkday(date, memberId, contractId) {
    const d = new Date(date);
    const day = d.getDay(); // 0=zo, 6=za
    if (day === 6 || day === 0) {
      const friday = new Date(d);
      friday.setDate(d.getDate() - (day === 6 ? 1 : 2));
      const monday = new Date(d);
      monday.setDate(d.getDate() + (day === 6 ? 2 : 1));
      if (!(await hasConflict(friday, memberId, contractId))) return friday;
      if (!(await hasConflict(monday, memberId, contractId))) return monday;
      return monday;
    }
    if (!(await hasConflict(d, memberId, contractId))) return d;
    for (let i = 1; i <= 3; i++) {
      const test = new Date(d);
      test.setDate(d.getDate() + i);
      if (test.getDay() >= 1 && test.getDay() <= 5 && !(await hasConflict(test, memberId, contractId))) return test;
    }
    return d;
  }

  // 3️⃣ 12 maanden vooruit plannen
  let current = new Date(start);
  const end = new Date(current);
  end.setMonth(end.getMonth() + 12);
  let counter = 0;

  while (current <= end) {
    const bestDate = await findBestWorkday(current, null, contract.id);
    const pid = uuidv4();
    await pool.query(
      `INSERT INTO planning (id, contract_id, date, status, created_at)
       VALUES ($1,$2,$3,'Gepland',now())`,
      [pid, contract.id, bestDate.toISOString()]
    );
    try {
      await fetch(`${process.env.APP_URL}/api/planning/auto-assign/${pid}`, { method: "POST" });
    } catch (e) {
      console.warn("Auto-assign mislukt:", e.message);
    }
    counter++;
    current = new Date(computeNextVisit(current, freq));
  }

  console.log(`🧩 Slimme planning: ${counter} afspraken aangemaakt voor contract ${contract.id}`);
} catch (err) {
  console.warn("❌ Slimme planning niet gelukt:", err.message);
}


    // ✅ Automatisch planningrecord (alleen als next_visit <= vandaag)
    if (contract.next_visit) {
      try {
        const existing = await pool.query(
          "SELECT id FROM planning WHERE contract_id=$1 AND date::date=$2::date",
          [contract.id, contract.next_visit]
        );
        if (!existing.rowCount) {
          await pool.query(
            `INSERT INTO planning (id, contract_id, date, status, created_at)
             VALUES ($1,$2,$3,'Gepland',now())`,
            [uuidv4(), contract.id, contract.next_visit]
          );
          console.log(`✅ Planningrecord aangemaakt bij update voor contract ${contract.id}`);
          console.log(`📢 Debug: automatisch planningrecord aangemaakt (${contract.id})`);
        }
      } catch (err) {
        console.error("❌ Fout bij automatisch planningrecord (PUT):", err.message);
      }
    }

    if (typeof contract.type_service === "string")
      contract.type_service = JSON.parse(contract.type_service);

    res.json(contract);
  } catch (err) {
    console.error("❌ DB update error:", err.message);
    res.status(500).json({ error: "Database update error" });
  }
});

/** ✅ PATCH – bezoek registreren */
router.patch("/:id/visit", async (req, res) => {
  try {
    const { date } = req.body;
    const when = date ? new Date(date).toISOString() : new Date().toISOString();

    const contract = await pool.query("SELECT frequency FROM contracts WHERE id=$1", [req.params.id]);
    if (!contract.rows.length)
      return res.status(404).json({ error: "Contract niet gevonden" });

    const nextVisit = computeNextVisit(when, contract.rows[0].frequency);

    const { rows } = await pool.query(
      `UPDATE contracts
       SET last_visit=$1, next_visit=$2
       WHERE id=$3 RETURNING *`,
      [when, nextVisit, req.params.id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Visit update error:", err.message);
    res.status(500).json({ error: "Update visit failed" });
  }
});

/** ✅ PATCH – handmatige override van nextVisit */
router.patch("/:id/override", async (req, res) => {
  try {
    const { nextVisit } = req.body;
    if (!nextVisit)
      return res.status(400).json({ error: "nextVisit verplicht (ISO string)" });

    const { rows } = await pool.query(
      `UPDATE contracts SET next_visit=$1 WHERE id=$2 RETURNING *`,
      [new Date(nextVisit).toISOString(), req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Contract niet gevonden" });

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Override error:", err.message);
    res.status(500).json({ error: "Override update failed" });
  }
});

export default router;
