// routes/planning.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/* ===========================================================
   🗓️  Planning Endpoints
   =========================================================== */

/**
 * ✅ GET /api/planning/schedule?range=week|month|today|year|all&memberId=&status=&start=
 * Haalt ingeplande records op uit planning-tabel, met joins en filters.
 */
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

/**
 * ✅ POST /api/planning
 * { contractId, memberId, date, status } → handmatig nieuw item
 */
router.post("/", async (req, res) => {
  try {
    const { contractId, memberId, date, status = "Gepland", comment = null } = req.body;
    if (!contractId || !date)
      return res.status(400).json({ error: "contractId en date zijn verplicht" });

    // 1️⃣ Eerst de planning aanmaken
    const { rows } = await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, status, comment, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       RETURNING *`,
      [uuidv4(), contractId, memberId || null, new Date(date).toISOString(), status, comment]
    );

    // 2️⃣ Daarna pas auto-assign proberen (niet blocking)
    try {
      await fetch(`${process.env.APP_URL}/api/planning/auto-assign/${rows[0].id}`, { method: "POST" });
    } catch (e) {
      console.warn("Auto-assign call failed:", e.message);
    }

    // 3️⃣ Antwoord teruggeven
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Planning create error:", err);
    res.status(500).json({ error: "Failed to create planning item" });
  }
});


/**
 * ✅ PUT /api/planning/:id
 * Update bestaand planningrecord (datum, member, status, comment)
 * + automatische contract-update bij Afgerond
 */
router.put("/:id", async (req, res) => {
  try {
    const { memberId, date, status, comment } = req.body;

    // Huidig record + frequentie ophalen
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

    // Basisupdate
    const { rows } = await pool.query(
      `UPDATE planning
       SET member_id = COALESCE($1, member_id),
           date = COALESCE($2, date),
           status = COALESCE($3, status),
           comment = COALESCE($4, comment)
       WHERE id = $5
       RETURNING *`,
      [
        memberId || null,
        date ? new Date(date).toISOString() : null,
        status || null,
        comment || null,
        req.params.id
      ]
    );
    const updated = rows[0];

    // Extra logica bij statuswijziging
    if (status === "Afgerond") {
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
         SET last_visit=$1, next_visit=$2
         WHERE id=$3`,
        [lastVisit, next, current.contract_id]
      );
      console.log(`✅ Contract ${current.contract_id} bijgewerkt na Afgerond`);
    }

    if (status === "Geannuleerd") {
      console.log(`⚠️ Planning ${req.params.id} geannuleerd — wacht op herplanning via frontend`);
    }

    res.json(updated);
  } catch (err) {
    console.error("Planning update error:", err);
    res.status(500).json({ error: "Database update error" });
  }
});

/**
 * ✅ DELETE /api/planning/:id
 * Verwijdert een planningrecord
 */
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

/**
 * ✅ POST /api/planning/generate
 * Automatische generatie op basis van actieve klanten + €400-regel
 */
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
        inserts.push(pool.query(
          `INSERT INTO planning (id, contract_id, member_id, date, status, created_at)
           VALUES ($1,$2,$3,$4,'Gepland',now())`,
          [uuidv4(), c.id, b.member.id, planDate.toISOString()]
        ));
      }
    }
    const result = await Promise.all(inserts);

    res.json({
      ok: true,
      generated: result.length,
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
/**
 * ✅ Smart Planning Engine v2 – Auto-assign member op basis van ORS route-optimalisatie en €400-regel
 * POST /api/planning/auto-assign/:id
 */
router.post("/auto-assign/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Haal planningrecord + contract + adres op
    const { rows: pRows } = await pool.query(`
      SELECT p.id, p.contract_id, p.member_id, p.date,
             c.price_inc, c.contact_id,
             ct.address, ct.house_number, ct.city
      FROM planning p
      JOIN contracts c ON c.id = p.contract_id
      JOIN contacts ct ON ct.id = c.contact_id
      WHERE p.id = $1
    `, [id]);

    if (!pRows.length) return res.status(404).json({ error: "Planning item niet gevonden" });
    const P = pRows[0];

    // Als al toegewezen -> niets doen
    if (P.member_id) return res.json({ ok: true, alreadyAssigned: true });

    // 2️⃣ Alle actieve members ophalen
    const { rows: members } = await pool.query(`SELECT id, name FROM members WHERE active = true ORDER BY created_at ASC`);
    if (!members.length) return res.json({ ok: true, assigned: false, reason: "no_active_members" });

    const dayISO = new Date(P.date).toISOString().slice(0, 10);
    const scores = [];

    // 3️⃣ Helper: geocode met ORS
    async function geocode(addr, hn, city) {
      const query = [addr, hn, city].filter(Boolean).join(" ");
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${process.env.ORS_API_KEY}&text=${encodeURIComponent(query)}&boundary.country=NL`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      const f = j?.features?.[0]?.geometry?.coordinates;
      return Array.isArray(f) ? { lon: f[0], lat: f[1] } : null;
    }

    // 4️⃣ Helper: afstand berekenen (km)
    async function getDistanceKM(a, b) {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.ORS_API_KEY}`;
      const body = { coordinates: [[a.lon, a.lat], [b.lon, b.lat]] };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!r.ok) return 9999;
      const j = await r.json();
      const m = j?.routes?.[0]?.summary?.distance || 0;
      return m / 1000;
    }

    // 5️⃣ Geocode nieuwe locatie
    const Pcoord = await geocode(P.address, P.house_number, P.city);
    if (!Pcoord) return res.json({ ok: true, assigned: false, reason: "geocode_failed" });

    // 6️⃣ Per member berekenen
    for (const M of members) {
      // Dagplanning van member ophalen
      const { rows: jobs } = await pool.query(`
        SELECT p.id, c.price_inc, ct.address, ct.house_number, ct.city
        FROM planning p
        JOIN contracts c ON c.id = p.contract_id
        JOIN contacts ct ON ct.id = c.contact_id
        WHERE p.member_id = $1
          AND p.date::date = $2::date
          AND p.status <> 'Geannuleerd'
      `, [M.id, dayISO]);

      const total = jobs.reduce((t, x) => t + (Number(x.price_inc) || 0), 0);
      const projected = total + (Number(P.price_inc) || 0);
      if (projected > 400) {
        // Over budget → penalty
        scores.push({ memberId: M.id, score: 9999 });
        continue;
      }

      // Route-impact berekenen
      let routePenalty = 0;
      if (jobs.length > 0) {
        let minDist = 9999;
        for (const j of jobs) {
          const c = await geocode(j.address, j.house_number, j.city);
          if (c) {
            const d = await getDistanceKM(c, Pcoord);
            if (d < minDist) minDist = d;
          }
        }
        routePenalty = minDist;
      }

      scores.push({ memberId: M.id, score: routePenalty });
    }

    // 7️⃣ Beste kandidaat selecteren
    scores.sort((a, b) => a.score - b.score);
    const best = scores[0];
    if (!best || best.score >= 9999) {
      return res.json({ ok: true, assigned: false, reason: "no_good_candidate" });
    }

    // 8️⃣ Member toewijzen
    await pool.query(`UPDATE planning SET member_id = $1 WHERE id = $2`, [best.memberId, id]);
    return res.json({ ok: true, assigned: true, memberId: best.memberId });
  } catch (err) {
    console.error("Auto-assign error:", err);
    res.status(500).json({ error: "Auto-assign failed" });
  }
});

/**
 * ✅ Herplan een bestaande afspraak automatisch volgens frequentie
 * POST /api/planning/replan/:id
 */
router.post("/replan/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Huidige planning + contract ophalen
    const { rows } = await pool.query(`
      SELECT p.id, p.contract_id, p.member_id, p.date, p.comment,
             c.frequency, c.contact_id
      FROM planning p
      JOIN contracts c ON c.id = p.contract_id
      WHERE p.id = $1
    `, [id]);
    if (!rows.length) return res.status(404).json({ error: "Planning niet gevonden" });

    const current = rows[0];

    // 2️⃣ Frequentie → nieuwe datum berekenen
    const base = new Date(current.date);
    const next = new Date(base);
    switch (current.frequency) {
      case "3 weken": next.setDate(base.getDate() + 21); break;
      case "4 weken": next.setDate(base.getDate() + 28); break;
      case "6 weken": next.setDate(base.getDate() + 42); break;
      case "8 weken": next.setDate(base.getDate() + 56); break;
      case "12 weken": next.setDate(base.getDate() + 84); break;
      case "Maand": next.setMonth(base.getMonth() + 1); break;
      case "3 keer per jaar": next.setMonth(base.getMonth() + 4); break;
      case "1 keer per jaar": next.setFullYear(base.getFullYear() + 1); break;
      default: next.setMonth(base.getMonth() + 1);
    }
    const nextDate = next.toISOString().split("T")[0];

    // 3️⃣ Nieuwe planningrecord aanmaken (comment meenemen)
    const { rows: ins } = await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, status, comment, created_at)
       VALUES ($1,$2,$3,$4,'Gepland',$5,now())
       RETURNING id`,
      [uuidv4(), current.contract_id, current.member_id || null, nextDate, current.comment || null]
    );

    // 4️⃣ Slimme membertoewijzing (indien nodig)
    try {
      await fetch(`${process.env.APP_URL}/api/planning/auto-assign/${ins[0].id}`, { method: "POST" });
    } catch (e) {
      console.warn("Auto-assign bij replan mislukt:", e.message);
    }

    res.json({ ok: true, newId: ins[0].id, nextDate });
  } catch (err) {
    console.error("Replan error:", err);
    res.status(500).json({ error: "Failed to replan" });
  }
});

export default router;
