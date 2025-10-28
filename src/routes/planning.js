// routes/planning.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/* ===========================================================
   🧭 Kalender-hulpfuncties (NL & EN labels ondersteund)
   =========================================================== */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeekMonday(d) {
  const x = startOfDay(d);
  const day = x.getDay() || 7; // ma=1, zo=7
  return addDays(x, -(day - 1));
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function startOfNextYear(d) {
  return new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
}

/* ===========================================================
   📅 ISO-weeknummer (maandag = dag 1)
   =========================================================== */
function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // ma=1..zo=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Map front-end waarde → [from, to] (ISO strings)
 * NL labels: "Vandaag", "Deze week", "Deze maand", "Dit jaar", "Specifieke datum", "Alles"
 * EN labels: "today", "week", "month", "year", "date", "all"
 */
function resolveRange(rangeLabel, startParam) {
  const now = new Date();
  const label = String(rangeLabel || "").toLowerCase();

  let customStart = null;
  if (startParam) {
    const t = new Date(startParam);
    if (!isNaN(t.valueOf())) customStart = t;
  }

  const isToday = ["vandaag", "today"].includes(label);
  const isWeek = ["deze week", "week"].includes(label);
  const isMonth = ["deze maand", "month"].includes(label);
  const isYear = ["dit jaar", "year"].includes(label);
  const isDate = ["specifieke datum", "date"].includes(label);
  const isAll = ["alles", "all"].includes(label);

  let from, to;

  if (isToday) {
    from = startOfDay(now);
    to = addDays(from, 1);
  } else if (isWeek) {
    from = startOfWeekMonday(now);
    to = addDays(from, 7);
  } else if (isMonth) {
    from = startOfMonth(now);
    to = startOfNextMonth(now);
  } else if (isYear) {
    from = startOfYear(now);
    to = startOfNextYear(now);
  } else if (isDate) {
    const base = customStart ? startOfDay(customStart) : startOfDay(now);
    from = base;
    to = addDays(base, 1);
  } else if (isAll) {
    from = new Date(now.getFullYear() - 5, 0, 1);
    to = new Date(now.getFullYear() + 10, 0, 1);
  } else {
    // fallback → week (ma–zo)
    from = startOfWeekMonday(now);
    to = addDays(from, 7);
  }

  return [from.toISOString(), to.toISOString()];
}

/* ===========================================================
   🔁 Compute next visit (zelfde keuzes als contract.js)
   =========================================================== */
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

/* ===========================================================
   🗓️  Endpoints
   =========================================================== */

/**
 * ✅ GET /api/planning/schedule?range=…&memberId=&status=&start=YYYY-MM-DD&week=NN
 * - range ondersteunt NL/EN labels
 * - extra optionele filter: week=NN (ISO weeknummer)
 */
router.get("/schedule", async (req, res) => {
  try {
    const { range = "Deze week", memberId, status, start, week } = req.query;
    const [fromIso, toIso] = resolveRange(range, start);

    const params = [fromIso, toIso];
    let filter = "";
    if (memberId) { params.push(memberId); filter += ` AND p.member_id = $${params.length}`; }
    if (status)   { params.push(status);   filter += ` AND p.status = $${params.length}`; }
    if (week)     { params.push(parseInt(week, 10)); filter += ` AND p.week_number = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT 
         p.id, p.contract_id, p.member_id, p.date, p.week_number,
         p.status, p.comment, p.cancel_reason, p.invoiced,
         c.contact_id AS client_id, ct.name AS customer,
         ct.address, ct.house_number, ct.city,
         m.name AS member_name
       FROM planning p
       JOIN contracts c ON p.contract_id = c.id
       JOIN contacts  ct ON c.contact_id = ct.id
       LEFT JOIN members m ON p.member_id = m.id
       WHERE p.date >= $1 AND p.date < $2
       ${filter}
       ORDER BY p.date ASC, customer ASC`,
      params
    );

    res.json({ items: rows, range: { from: fromIso, to: toIso } });
  } catch (err) {
    console.error("Planning schedule fetch error:", err);
    res.status(500).json({ error: "Database error while fetching schedule" });
  }
});

/**
 * ✅ GET /api/planning/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.frequency, ct.name AS customer
         FROM planning p
         JOIN contracts c ON p.contract_id = c.id
         JOIN contacts ct ON c.contact_id = ct.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Planning item niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Planning get error:", err);
    res.status(500).json({ error: "Database error while fetching planning item" });
  }
});

/**
 * ✅ POST /api/planning
 * { contractId, memberId, date, status, comment, invoiced }
 * → berekent automatisch week_number (ISO)
 */
router.post("/", async (req, res) => {
  try {
    const { contractId, memberId, date, status = "Gepland", comment = null, invoiced = false } = req.body;
    if (!contractId || !date)
      return res.status(400).json({ error: "contractId en date zijn verplicht" });

    const dt = new Date(date);
    const weekNumber = getIsoWeekNumber(dt);

    const { rows } = await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, week_number, status, comment, invoiced, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       RETURNING *`,
      [uuidv4(), contractId, memberId || null, dt.toISOString(), weekNumber, status, comment, !!invoiced]
    );

    // Niet-blokkerend: auto-assign proberen
    try {
      await fetch(`${process.env.APP_URL}/api/planning/auto-assign/${rows[0].id}`, { method: "POST" });
    } catch (e) {
      console.warn("Auto-assign call failed:", e.message);
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Planning create error:", err);
    res.status(500).json({ error: "Failed to create planning item" });
  }
});

/**
 * ✅ PUT /api/planning/:id
 * - bij wijziging 'date' → week_number herberekenen
 * - contractlogica bij Afgerond en annuleer-reeks bij specifieke redenen
 */
router.put("/:id", async (req, res) => {
  try {
    const { memberId, date, status, comment, invoiced, cancel_reason } = req.body;

    // 1) Huidig record + contract-frequentie
    const { rows: currentRows } = await pool.query(
      `SELECT p.*, c.frequency, c.id AS contract_id
       FROM planning p
       JOIN contracts c ON p.contract_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!currentRows.length) return res.status(404).json({ error: "Planning item niet gevonden" });
    const current = currentRows[0];

    // Weeknummer herberekenen indien datum meegegeven
    const newWeek = date ? getIsoWeekNumber(new Date(date)) : null;

    // 2) Update planning-record
    const { rows } = await pool.query(
      `UPDATE planning
         SET member_id     = COALESCE($1, member_id),
             date          = COALESCE($2, date),
             week_number   = COALESCE($3, week_number),
             status        = COALESCE($4, status),
             comment       = COALESCE($5, comment),
             invoiced      = COALESCE($6, invoiced),
             cancel_reason = COALESCE($7, cancel_reason)
       WHERE id = $8
       RETURNING *`,
      [
        memberId || null,
        date ? new Date(date).toISOString() : null,
        newWeek,
        status || null,
        comment || null,
        typeof invoiced === "boolean" ? invoiced : null,
        cancel_reason || null,
        req.params.id,
      ]
    );
    const updated = rows[0];

    // 3) Reeks annuleren indien reden volledige stop aangeeft
    if (status === "Geannuleerd") {
      if (["Contract stop gezet door klant", "Contract stop gezet door ons"].includes(cancel_reason)) {
        await pool.query(
          `UPDATE planning
             SET status = 'Geannuleerd',
                 cancel_reason = COALESCE(cancel_reason, $1)
           WHERE contract_id = $2 AND date >= $3`,
          [cancel_reason, updated.contract_id, updated.date]
        );
        console.log(`🛑 Volledige reeks geannuleerd voor contract ${updated.contract_id}`);
      } else {
        console.log(`ℹ️ Geannuleerd met reden "${cancel_reason}" – herplan via frontend toegestaan`);
      }
    }

    // 4) Contract bijwerken na Afgerond
    if (status === "Afgerond") {
      const lastVisit = new Date(updated.date).toISOString();
      const next = computeNextVisit(lastVisit, current.frequency);
      await pool.query(
        `UPDATE contracts SET last_visit = $1, next_visit = $2 WHERE id = $3`,
        [lastVisit, next, current.contract_id]
      );
      console.log(`✅ Contract ${current.contract_id} bijgewerkt na Afgerond`);
    }

    res.json(updated);
  } catch (err) {
    console.error("Planning update error:", err);
    res.status(500).json({ error: "Database update error" });
  }
});

/**
 * ✅ DELETE /api/planning/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM planning WHERE id=$1 RETURNING id`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Planning item niet gevonden" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Planning delete error:", err);
    res.status(500).json({ error: "Database delete error" });
  }
});

/**
 * ✅ (Optioneel) Auto-assign endpoint — non-blocking helper
 */
router.post("/auto-assign/:id", async (req, res) => {
  try {
    res.json({ ok: true, planningId: req.params.id });
  } catch (err) {
    console.warn("Auto-assign error:", err.message);
    res.json({ ok: true, planningId: req.params.id });
  }
});

export default router;
