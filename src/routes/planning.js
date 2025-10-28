// routes/planning.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/* ============================
   🧠 Slimme Planning Helpers
   ============================ */

// Check of een member of contract al iets op die datum heeft
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

// Vind de beste werkdag rondom een datum (vrijdag / maandag als weekend of conflict)
async function findBestWorkday(date, memberId, contractId) {
  const d = new Date(date);
  const day = d.getDay(); // 0=zo, 6=za

  // Weekend → probeer vrijdag, anders maandag
  if (day === 6 || day === 0) {
    const friday = new Date(d);
    friday.setDate(d.getDate() - (day === 6 ? 1 : 2)); // za->vr, zo->vr
    const monday = new Date(d);
    monday.setDate(d.getDate() + (day === 6 ? 2 : 1));

    if (!(await hasConflict(friday, memberId, contractId))) return friday;
    if (!(await hasConflict(monday, memberId, contractId))) return monday;
    return monday; // beide vol: maandag
  }

  // Geen weekend → neem originele dag als mogelijk
  if (!(await hasConflict(d, memberId, contractId))) return d;

  // Conflict → schuif max 3 dagen vooruit (alleen werkdagen)
  for (let i = 1; i <= 3; i++) {
    const test = new Date(d);
    test.setDate(d.getDate() + i);
    if (test.getDay() >= 1 && test.getDay() <= 5 && !(await hasConflict(test, memberId, contractId))) {
      return test;
    }
  }
  return d; // fallback
}

/* ============================
   🤖 Auto-assign (intern)
   ============================ */

async function autoAssignPlanningInternal(id) {
  // 1) haal planning + adres op
  const { rows: pRows } = await pool.query(`
    SELECT p.id, p.contract_id, p.member_id, p.date,
           c.price_inc, c.contact_id,
           ct.address, ct.house_number, ct.city
    FROM planning p
    JOIN contracts c ON c.id = p.contract_id
    JOIN contacts ct ON ct.id = c.contact_id
    WHERE p.id = $1
  `, [id]);

  if (!pRows.length) return { ok: false, reason: "not_found" };
  const P = pRows[0];
  if (P.member_id) return { ok: true, alreadyAssigned: true }; // al toegewezen

  // 2) actieve members
  const { rows: members } = await pool.query(`SELECT id, name FROM members WHERE active = true ORDER BY created_at ASC`);
  if (!members.length) return { ok: false, reason: "no_active_members" };

  // === simpele fallback zonder externe APIs ===
  // Score: hoeveel € al gepland op die dag + "afstand" als 0 (geen GIS)
  const dayISO = new Date(P.date).toISOString().slice(0, 10);
  let candidates = [];
  for (const M of members) {
    const { rows: jobs } = await pool.query(`
      SELECT c.price_inc
      FROM planning p
      JOIN contracts c ON c.id = p.contract_id
      WHERE p.member_id = $1 AND p.date::date = $2::date AND p.status <> 'Geannuleerd'
    `, [M.id, dayISO]);

    const total = jobs.reduce((t, x) => t + (Number(x.price_inc) || 0), 0);
    const projected = total + (Number(P.price_inc) || 0);

    // budget-principe: onder 400 is beter, boven 400 straf
    const score = projected <= 400 ? projected : 100000 + projected;
    candidates.push({ memberId: M.id, score });
  }
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  if (!best || best.score >= 100000) return { ok: false, reason: "no_good_candidate" };

  await pool.query(`UPDATE planning SET member_id = $1 WHERE id = $2`, [best.memberId, id]);
  return { ok: true, assigned: true, memberId: best.memberId };
}

/* ============================
   🗓️ Endpoints
   ============================ */

router.get("/schedule", async (req, res) => {
  try {
    const { range = "week", memberId, status, start } = req.query;
    const startDate = start ? new Date(start) : new Date();
    const from = new Date(startDate);
    const to = new Date(startDate);

    switch (range) {
      case "today": to.setDate(from.getDate() + 1); break;
      case "month": to.setMonth(from.getMonth() + 1); break;
      case "year": to.setFullYear(from.getFullYear() + 1); break;
      case "all":  to.setFullYear(from.getFullYear() + 10); break;
      default:     to.setDate(from.getDate() + 7); // week
    }

    const params = [from.toISOString(), to.toISOString()];
    let filter = "";
    if (memberId) { params.push(memberId); filter += ` AND p.member_id = $${params.length}`; }
    if (status)   { params.push(status);   filter += ` AND p.status = $${params.length}`; }

    const { rows } = await pool.query(
      `SELECT 
         p.id, p.contract_id, p.member_id, p.date, p.status, p.comment,
         p.cancel_reason, p.invoiced,
         c.contact_id AS client_id, ct.name AS customer,
         ct.address, ct.house_number, ct.city,
         m.name AS member_name
       FROM planning p
       JOIN contracts c ON p.contract_id = c.id
       JOIN contacts ct ON c.contact_id = ct.id
       LEFT JOIN members m ON p.member_id = m.id
       WHERE p.date BETWEEN $1 AND $2
       ${filter}
       ORDER BY p.date ASC, customer ASC`,
      params
    );

    res.json({ items: rows });
  } catch (err) {
    console.error("Planning schedule fetch error:", err);
    res.status(500).json({ error: "Database error while fetching schedule" });
  }
});

/** Handmatig nieuw item (Ad-hoc) */
router.post("/", async (req, res) => {
  try {
    const { contractId, memberId, date, status = "Gepland", comment = null, invoiced = false } = req.body;
    if (!contractId || !date)
      return res.status(400).json({ error: "contractId en date zijn verplicht" });

    const { rows } = await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, status, comment, invoiced, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       RETURNING *`,
      [uuidv4(), contractId, memberId || null, new Date(date).toISOString(), status, comment, !!invoiced]
    );

    // interne auto-assign (niet via HTTP)
    try { await autoAssignPlanningInternal(rows[0].id); } catch {}

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Planning create error:", err);
    res.status(500).json({ error: "Failed to create planning item" });
  }
});

/** Update bestaand planningrecord */
router.put("/:id", async (req, res) => {
  try {
    const { memberId, date, status, comment, invoiced, cancel_reason } = req.body;

    const { rows: currentRows } = await pool.query(
      `SELECT p.*, c.frequency, c.id AS contract_id
       FROM planning p
       JOIN contracts c ON p.contract_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!currentRows.length)
      return res.status(404).json({ error: "Planning item niet gevonden" });
    const current = currentRows[0];

    // cancel_reason alleen vullen als status 'Geannuleerd' is; anders leeg maken
    const { rows } = await pool.query(
      `UPDATE planning
       SET member_id   = COALESCE($1, member_id),
           date        = COALESCE($2, date),
           status      = COALESCE($3, status),
           comment     = COALESCE($4, comment),
           invoiced    = COALESCE($5, invoiced),
           cancel_reason = CASE WHEN COALESCE($3, status) = 'Geannuleerd' THEN $6 ELSE NULL END
       WHERE id = $7
       RETURNING *`,
      [
        memberId || null,
        date ? new Date(date).toISOString() : null,
        status || null,
        comment || null,
        typeof invoiced === "boolean" ? invoiced : null,
        cancel_reason || null,
        req.params.id
      ]
    );
    const updated = rows[0];

    // reeks stopzetten bij “stop gezet …”
    if (updated.status === "Geannuleerd" &&
        ["Contract stop gezet door klant", "Contract stop gezet door ons"].includes(updated.cancel_reason)) {
      await pool.query(
        `UPDATE planning
         SET status = 'Geannuleerd',
             cancel_reason = COALESCE(cancel_reason, $1)
         WHERE contract_id = $2 AND date >= $3`,
        [updated.cancel_reason, updated.contract_id, updated.date]
      );
      console.log(`🛑 Volledige reeks geannuleerd voor contract ${updated.contract_id}`);
    }

    // bij “Afgerond” contract bijwerken (last/next)
    if (updated.status === "Afgerond") {
      const computeNextVisit = (lastVisit, freq) => {
        const base = new Date(lastVisit);
        const d = new Date(base);
        switch (freq) {
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
      };

      const lastVisit = new Date(updated.date).toISOString();
      const next = computeNextVisit(lastVisit, current.frequency);

      await pool.query(
        `UPDATE contracts
         SET last_visit = $1, next_visit = $2
         WHERE id = $3`,
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

/** Verwijder item */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM planning WHERE id=$1 RETURNING id", [req.params.id]);
    if (!result.rowCount)
      return res.status(404).json({ error: "Planning item niet gevonden" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Planning delete error:", err);
    res.status(500).json({ error: "Database delete error" });
  }
});

/** Dagplanning genereren (bestaand gedrag) */
router.post("/generate", async (req, res) => {
  try {
    const { date } = req.body || {};
    const planDate = date ? new Date(date) : new Date();
    planDate.setHours(9, 0, 0, 0);

    const { rows: members } = await pool.query(
      `SELECT * FROM members WHERE active = true ORDER BY created_at ASC`
    );
    if (!members.length)
      return res.status(400).json({ error: "Geen actieve members gevonden" });

    const { rows: contracts } = await pool.query(`
      SELECT c.*, ct.name AS customer, ct.address, ct.house_number, ct.city
      FROM contracts c
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE c.active = true AND ct.status = 'Active' AND c.next_visit <= $1
    `, [planDate.toISOString()]);

    const { rows: existing } = await pool.query(
      `SELECT contract_id FROM planning WHERE date::date = $1::date`,
      [planDate.toISOString()]
    );
    const alreadySet = new Set(existing.map(r => r.contract_id));
    const todo = contracts.filter(c => !alreadySet.has(c.id));

    todo.sort((a, b) => new Date(a.next_visit) - new Date(b.next_visit));

    const buckets = members.map(m => ({ member: m, total: 0, items: [] }));
    for (const c of todo) {
      const price = Number(c.price_inc || 0);
      let slot = buckets.find(b => b.total + price <= 400);
      if (!slot) slot = buckets.reduce((min, x) => (x.total < min.total ? x : min), buckets[0]);
      slot.items.push(c);
      slot.total += price;
    }

    const inserts = [];
    for (const b of buckets) {
      for (const c of b.items) {
        const id = uuidv4();
        inserts.push(pool.query(
          `INSERT INTO planning (id, contract_id, member_id, date, status, created_at)
           VALUES ($1,$2,$3,$4,'Gepland',now())`,
          [id, c.id, b.member.id, planDate.toISOString()]
        ).then(() => autoAssignPlanningInternal(id)).catch(()=>{}));
      }
    }
    await Promise.all(inserts);

    res.json({
      ok: true,
      generated: inserts.length,
      members: buckets.map(b => ({
        member: b.member.name,
        totaal: b.total,
        aantal: b.items.length
      }))
    });
  } catch (err) {
    console.error("Planning generate error:", err);
    res.status(500).json({ error: "Failed to generate planning" });
  }
});

/** ✅ Replan: slimme volgende + volledige reeks vanaf die datum */
router.post("/replan/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(`
      SELECT p.id, p.contract_id, p.member_id, p.date, p.comment,
             c.frequency
      FROM planning p
      JOIN contracts c ON c.id = p.contract_id
      WHERE p.id = $1
    `, [id]);
    if (!rows.length) return res.status(404).json({ error: "Planning niet gevonden" });

    const current = rows[0];
    const { computeNextVisit } = await import("./contracts.js");

    // 1) Bepaal volgende datum + slim corrigeren
    const next = new Date(computeNextVisit(current.date, current.frequency));
    const firstBest = await findBestWorkday(next, current.member_id, current.contract_id);

    // 2) Oude reeks vanaf firstBest wissen
    await pool.query(
      `DELETE FROM planning
       WHERE contract_id = $1 AND date >= $2`,
      [current.contract_id, firstBest.toISOString()]
    );

    // 3) Eerste item met comment kopie (zoals gevraagd)
    const firstId = uuidv4();
    await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, status, comment, created_at)
       VALUES ($1,$2,$3,$4,'Gepland',$5,now())`,
      [firstId, current.contract_id, current.member_id || null, firstBest.toISOString(), current.comment || null]
    );
    try { await autoAssignPlanningInternal(firstId); } catch {}

    // 4) Rest van 12 maanden reeks
    let count = 1;
    let cursor = new Date(firstBest);
    const end = new Date(cursor);
    end.setMonth(end.getMonth() + 12);

    while (true) {
      const nextCursor = new Date(computeNextVisit(cursor, current.frequency));
      if (nextCursor > end) break;
      const best = await findBestWorkday(nextCursor, current.member_id, current.contract_id);
      const idNew = uuidv4();
      await pool.query(
        `INSERT INTO planning (id, contract_id, member_id, date, status, created_at)
         VALUES ($1,$2,$3,$4,'Gepland',now())`,
        [idNew, current.contract_id, current.member_id || null, best.toISOString()]
      );
      try { await autoAssignPlanningInternal(idNew); } catch {}
      cursor = new Date(best);
      count++;
    }

    res.json({ ok: true, newFirstId: firstId, firstDate: firstBest.toISOString(), generated: count });
  } catch (err) {
    console.error("❌ Replan error:", err);
    res.status(500).json({ error: err.message || "Failed to replan" });
  }
});

/** ✅ Update frequentie: hele reeks vanaf startDate, 12 maanden, slim + auto-assign */
router.post("/update-frequency", async (req, res) => {
  try {
    const { contractId, memberId, startDate } = req.body;
    if (!contractId || !startDate)
      return res.status(400).json({ error: "contractId en startDate verplicht" });

    const contractRes = await pool.query(
      "SELECT frequency FROM contracts WHERE id=$1",
      [contractId]
    );
    if (!contractRes.rowCount)
      return res.status(404).json({ error: "Contract niet gevonden" });

    const { computeNextVisit } = await import("./contracts.js");
    const freq = contractRes.rows[0].frequency || "Maand";

    // 1) Delete toekomstige reeks vanaf start
    await pool.query(
      `DELETE FROM planning
       WHERE contract_id=$1 AND date >= $2`,
      [contractId, new Date(startDate).toISOString()]
    );

    // 2) Opnieuw opbouwen (12 maanden), slim plannen + auto-assign
    let current = new Date(startDate);
    const end = new Date(current);
    end.setMonth(end.getMonth() + 12);
    let count = 0;

    while (current <= end) {
      const bestDate = await findBestWorkday(current, memberId, contractId);
      const id = uuidv4();
      await pool.query(
        `INSERT INTO planning (id, contract_id, member_id, date, status, created_at)
         VALUES ($1,$2,$3,$4,'Gepland',now())`,
        [id, contractId, memberId || null, bestDate.toISOString()]
      );
      try { await autoAssignPlanningInternal(id); } catch {}
      count++;
      current = new Date(computeNextVisit(current, freq));
    }

    res.json({ updated: count });
  } catch (err) {
    console.error("❌ Fout bij update-frequency:", err);
    res.status(500).json({ error: err.message || "Update frequentie mislukt" });
  }
});

/** (optioneel) HTTP endpoint dat nog steeds werkt maar nu de interne helper gebruikt */
router.post("/auto-assign/:id", async (req, res) => {
  try {
    const out = await autoAssignPlanningInternal(req.params.id);
    if (!out.ok && out.reason) return res.json(out);
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error("Auto-assign error:", err);
    res.status(500).json({ error: "Auto-assign failed" });
  }
});

export default router;
