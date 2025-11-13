// routes/contracts.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
//import { rebuildSeriesForContract } from "./planningHelpers.js";

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

/* ─────────────────────────────────────────────────────────────
   Kleine helpers voor “slim plannen”
   ───────────────────────────────────────────────────────────── */

async function hasConflict(date, memberId, contractId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM planning
     WHERE date::date = $1::date
       AND (member_id = $2 OR contract_id = $3)
       AND status <> 'Geannuleerd'
     LIMIT 1`,
    [date.toISOString(), memberId, contractId]
  );
  return rows.length > 0;
}

async function findBestWorkday(date, memberId, contractId) {
  const d = new Date(date);
  const day = d.getDay(); // 0=zo, 6=za

  // Weekend → vrijdag proberen, anders maandag
  if (day === 6 || day === 0) {
    const friday = new Date(d);
    friday.setDate(d.getDate() - (day === 6 ? 1 : 2));
    const monday = new Date(d);
    monday.setDate(d.getDate() + (day === 6 ? 2 : 1));

    if (!(await hasConflict(friday, memberId, contractId))) return friday;
    if (!(await hasConflict(monday, memberId, contractId))) return monday;
    return monday; // fallback
  }

  // Werkdag → als conflict, schuif max 3 werkdagen op
  if (!(await hasConflict(d, memberId, contractId))) return d;

  for (let i = 1; i <= 3; i++) {
    const test = new Date(d);
    test.setDate(d.getDate() + i);
    if (test.getDay() >= 1 && test.getDay() <= 5 && !(await hasConflict(test, memberId, contractId))) {
      return test;
    }
  }
  return d; // fallback
}

/** Serie opnieuw opbouwen voor één contract (12 maanden vooruit) */
async function rebuildSeriesForContract(contract, opts = { logPrefix: "" }) {
  const logP = opts.logPrefix || "";

  // 1) Startdatum bepalen
  const now = new Date();
  const freq = contract.frequency || "Maand";
  let start;

  if (contract.last_visit) {
    const lv = new Date(contract.last_visit);
    if (lv > now) {
      start = lv; // laatste bezoek in de toekomst → eerste = die datum
    } else {
      start = new Date(computeNextVisit(lv, freq)); // historisch → volgende
    }
  } else if (contract.next_visit) {
    const nv = new Date(contract.next_visit);
    start = nv > now ? nv : now;
  } else {
    start = now;
  }

  // 2) Toekomstige niet-afgeronde/niet-gefactureerde afspraken verwijderen (alleen dit contract)
  await pool.query(
    `DELETE FROM planning
     WHERE contract_id = $1
       AND date::date >= $2::date
       AND (invoiced = false OR invoiced IS NULL)
       AND status <> 'Afgerond'`,
    [contract.id, start.toISOString()]
  );

  // 3) 12 maanden vooruit opnieuw plannen (met weekend/kleine conflictcorrectie)
  let current = new Date(start);
  const end = new Date(current);
  end.setMonth(end.getMonth() + 12);

  let counter = 0;
  while (current <= end) {
    const bestDate = await findBestWorkday(current, null, contract.id);

    // Alleen toevoegen als die dag voor dit contract nog niet bestaat
    const exists = await pool.query(
      `SELECT id FROM planning WHERE contract_id=$1 AND date::date=$2::date LIMIT 1`,
      [contract.id, bestDate.toISOString()]
    );
    if (!exists.rowCount) {
      const pid = uuidv4();
      await pool.query(
        `INSERT INTO planning (id, contract_id, date, status, created_at)
         VALUES ($1,$2,$3,'Gepland',now())`,
        [pid, contract.id, bestDate.toISOString()]
      );
      // Auto-assign (non-blocking)
      try {
        await fetch(`${process.env.APP_URL}/api/planning/auto-assign/${pid}`, { method: "POST" });
      } catch (e) {
        console.warn(`${logP}Auto-assign faalde:`, e.message);
      }
      counter++;
    }

    current = new Date(computeNextVisit(current, freq));
  }

  console.log(`${logP}🔁 Reeks herbouwd: ${counter} afspraken voor contract ${contract.id}`);
  return counter;
}

/* ─────────────────────────────────────────────────────────────
   Endpoints
   ───────────────────────────────────────────────────────────── */

/** ✅ GET – alle contracts (inclusief klantadresgegevens) */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        c.*,
        ct.name AS client_name,
        ct.address AS address,
        ct.house_number AS house_number,
        ct.city AS city,
        c.contract_eind_datum,
        c.maandelijkse_facturatie
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
      `SELECT c.*, ct.name AS client_name, c.contract_eind_datum, c.maandelijkse_facturatie
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

/** ✅ POST – nieuw contract (maakt ook 12m reeks aan) */
router.post("/", async (req, res) => {
  try {
    let {
      clientId, typeService, frequency, description,
      priceEx, vatPct, lastVisit,
      maandelijkse_facturatie, invoice_day // ✅ nieuwe velden
    } = req.body;

    // ✅ Automatisch beschrijving vullen op basis van typeService
    if ((!description || !description.trim()) && Array.isArray(typeService) && typeService.length) {
  description = typeService.join(", ");
    }

    const ex = parseFloat(priceEx) || 0;
    const vat = parseFloat(vatPct) || 0;
    const priceInc = Math.round(ex * (1 + vat / 100) * 100) / 100;
    const nextVisit = computeNextVisit(lastVisit, frequency);
    const safeInvoiceDay = invoice_day === "" ? null : Number(invoice_day) || null;


    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO contracts (
         id, contact_id, type_service, frequency, description,
         price_ex, vat_pct, price_inc, last_visit, next_visit,
         maandelijkse_facturatie, invoice_day
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        id, clientId, JSON.stringify(typeService), frequency, description,
        ex, vat, priceInc, lastVisit, nextVisit,
        maandelijkse_facturatie, safeInvoiceDay
      ]
    );

    const contract = rows[0];

    // ✅ Stuur de response direct terug naar de client
    res.status(201).json(contract);

    // ✅ Voer hierna alle “achtergrondacties” asynchroon uit
    //    (de client heeft al zijn antwoord)
    process.nextTick(async () => {
      try {
        // 🔁 Slimme initiële 12m reeks
        await rebuildSeriesForContract(contract, { logPrefix: "POST /contracts – " });
      } catch (err) {
        console.warn("❌ Slimme planning niet gelukt (POST):", err.message);
      }

      // (Compat) enkele eerste planning (alleen als nog niet bestaat)
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
            console.log(`✅ Enkel planningrecord aangemaakt (compat) voor contract ${contract.id}`);
          }
        } catch (err) {
          console.error("❌ Fout bij automatisch planningrecord (POST):", err.message);
        }
      }

      // ✅ JSON-parsen van type_service (alleen voor logging/consistentie)
      try {
        if (typeof contract.type_service === "string") {
          contract.type_service = JSON.parse(contract.type_service);
        }
      } catch {
        /* ignore JSON errors */
      }
    });
  } catch (err) {
    console.error("❌ DB insert error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Database insert error" });
    }
  }
});


/** ✅ PUT – update contract (+ veilige herbouw van toekomstige reeks) */
router.put("/:id", async (req, res) => {
  try {
    const {
  frequency, description, paymentNotes,
  priceEx, vatPct, groteBeurt, typeService,
  lastVisit, active,
  maandelijkse_facturatie, invoice_day    // ✅ nieuw veld toegevoegd
} = req.body;

const safeInvoiceDay = invoice_day === "" ? null : Number(invoice_day) || null;
const freq = allowedFreq.includes(frequency) ? frequency : undefined;
const ex = priceEx !== undefined ? parseFloat(priceEx) : undefined;
const vat = vatPct !== undefined ? parseFloat(vatPct) : undefined;
const nextVisit =
  (lastVisit || freq)
    ? computeNextVisit(lastVisit, freq || "Maand")
    : undefined;

 // ✅ Automatisch beschrijving updaten als typeService is gewijzigd
let newDescription = description;
if (!description && Array.isArray(typeService) && typeService.length) {
  description = typeService.join(", ");
}   
// contract_eind_datum blijft read-only
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
         maandelijkse_facturatie = COALESCE($10, maandelijkse_facturatie),
         invoice_day = COALESCE($11, invoice_day),      -- ✅ nieuw veld
         active = COALESCE($12, active)
   WHERE id = $13
   RETURNING *`,
  [
    freq, description, paymentNotes, ex, vat, groteBeurt,
    JSON.stringify(typeService), lastVisit, nextVisit,
    maandelijkse_facturatie, safeInvoiceDay, active, req.params.id
  ]
);


    if (!rows.length)
      return res.status(404).json({ error: "Contract niet gevonden" });

    const contract = rows[0];

    // 2) Reeks heropbouwen (12 maanden vooruit), veilig
    try {
      await rebuildSeriesForContract(contract, { logPrefix: "PUT /contracts – " });
    } catch (err) {
      console.warn("❌ Slimme planning niet gelukt (PUT):", err.message);
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

/** ✅ GET – contractdetails via planning-id (voor facturatie) */
router.get("/by-planning/:planningId", async (req, res) => {
  try {
     // ⛔️ Cache volledig uitschakelen
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const { planningId } = req.params;
    const { rows } = await pool.query(
      `SELECT ct.*, c.id AS client_id
       FROM contracts ct
       JOIN planning p ON p.contract_id = ct.id
       JOIN contacts c ON ct.contact_id = c.id
       WHERE p.id = $1
       LIMIT 1`,
      [planningId]
    );
    if (!rows.length) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Fout bij ophalen contract by planning:", err.message);
    res.status(500).json({ error: "Databasefout bij ophalen contract" });
  }
});


export default router;
