// routes/planning.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();
const ORS_API_KEY = process.env.ORS_API_KEY;

/* ===========================================================
   ✅ BASIS: bestaande contractweergave (ongewijzigd)
   =========================================================== */

router.get("/", async (req, res) => {
  try {
    const { period = "week", start } = req.query;
    const startDate = start ? new Date(start) : new Date();
    const from = new Date(startDate);
    const to = new Date(startDate);

    switch (period) {
      case "3weeks": to.setDate(to.getDate() + 21); break;
      case "6weeks": to.setDate(to.getDate() + 42); break;
      case "month":  to.setMonth(to.getMonth() + 1); break;
      case "year":   to.setFullYear(to.getFullYear() + 1); break;
      case "week":
      default:       to.setDate(to.getDate() + 7);
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const { rows } = await pool.query(
      `SELECT 
         c.id AS contract_id,
         c.contact_id AS client_id,
         ct.name AS customer,
         ct.address,
         c.next_visit AS nextvisit,
         c.frequency,
         c.type_service,
         c.price_inc
       FROM contracts c
       LEFT JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.active = true
         AND c.next_visit IS NOT NULL
         AND c.next_visit BETWEEN $1 AND $2
       ORDER BY c.next_visit ASC`,
      [fromIso, toIso]
    );

    res.json({ from: fromIso, to: toIso, items: rows });
  } catch (err) {
    console.error("Planning fetch error:", err);
    res.status(500).json({ error: "Database error while fetching planning" });
  }
});

router.patch("/:contractId/shift", async (req, res) => {
  try {
    const { nextVisit } = req.body;
    if (!nextVisit) return res.status(400).json({ error: "nextVisit verplicht" });

    const { rows } = await pool.query(
      `UPDATE contracts
       SET next_visit = $1
       WHERE id = $2
       RETURNING *`,
      [new Date(nextVisit).toISOString(), req.params.contractId]
    );

    if (!rows.length) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Planning shift error:", err);
    res.status(500).json({ error: "Database update error while shifting planning" });
  }
});

/* ===========================================================
   🔹 PLANNING CRUD (ongewijzigd gedrag)
   =========================================================== */

router.get("/schedule", async (req, res) => {
  try {
    const { range = "week", memberId } = req.query;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    switch (range) {
      case "today": end.setDate(start.getDate() + 1); break;
      case "month": end.setMonth(start.getMonth() + 1); break;
      case "year": end.setFullYear(start.getFullYear() + 1); break;
      case "all": end.setFullYear(start.getFullYear() + 10); break;
      default: end.setDate(start.getDate() + 7);
    }

    const params = [start.toISOString(), end.toISOString()];
    let filter = "";
    if (memberId) { filter = "AND p.member_id = $3"; params.push(memberId); }

    const { rows } = await pool.query(
      `SELECT 
         p.id, p.contract_id, p.member_id, p.date, p.status,
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

router.post("/", async (req, res) => {
  try {
    const { contractId, memberId, date, status = "Gepland" } = req.body;
    if (!contractId || !date)
      return res.status(400).json({ error: "contractId en date zijn verplicht" });

    const { rows } = await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, status, created_at)
       VALUES ($1,$2,$3,$4,$5,now())
       RETURNING *`,
      [uuidv4(), contractId, memberId || null, new Date(date).toISOString(), status]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Planning create error:", err);
    res.status(500).json({ error: "Failed to create planning item" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { memberId, date, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE planning
       SET member_id = COALESCE($1, member_id),
           date = COALESCE($2, date),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING *`,
      [memberId || null, date ? new Date(date).toISOString() : null, status || null, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: "Planning item niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Planning update error:", err);
    res.status(500).json({ error: "Database update error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM planning WHERE id=$1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Planning item niet gevonden" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Planning delete error:", err);
    res.status(500).json({ error: "Database delete error" });
  }
});

/* ===========================================================
   🤖 /generate – AI-ready + OpenRouteService route clustering
   =========================================================== */

router.post("/generate", async (req, res) => {
  try {
    const { date } = req.body || {};
    const planDate = date ? new Date(date) : new Date();
    planDate.setHours(9, 0, 0, 0);

    // 1️⃣ Actieve members
    const { rows: members } = await pool.query(
      `SELECT * FROM members WHERE active = true ORDER BY created_at ASC`
    );
    if (!members.length) return res.status(400).json({ error: "Geen actieve members gevonden" });

    // 2️⃣ Actieve contracten + klanten
    const { rows: contracts } = await pool.query(`
      SELECT c.*, ct.name AS customer, ct.address, ct.house_number, ct.city
      FROM contracts c
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE c.active = true
        AND ct.status = 'Active'
        AND c.next_visit <= $1
    `, [planDate.toISOString()]);

    // 3️⃣ Vermijd dubbele planning
    const { rows: existing } = await pool.query(
      `SELECT contract_id FROM planning WHERE date::date = $1::date`,
      [planDate.toISOString()]
    );
    const already = new Set(existing.map(r => r.contract_id));
    const todo = contracts.filter(c => !already.has(c.id));

    if (!todo.length)
      return res.json({ ok: true, generated: 0, message: "Geen nieuwe contracten om te plannen." });

    // 4️⃣ Basis sortering
    todo.sort((a, b) => new Date(a.next_visit) - new Date(b.next_visit));

    // 5️⃣ Postcodeclustering (AI-ready)
    const clusters = {};
    for (const c of todo) {
      const code = (c.address || "").match(/\d{4}\s?[A-Z]{0,2}/)?.[0] || "UNKNOWN";
      if (!clusters[code]) clusters[code] = [];
      clusters[code].push(c);
    }

    // 6️⃣ Optioneel route-optimalisatie via ORS (per cluster)
    async function geocode(addr, city) {
      if (!ORS_API_KEY) return null;
      const q = encodeURIComponent(`${addr}, ${city}, Netherlands`);
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${q}`;
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (d.features && d.features.length) {
          const [lon, lat] = d.features[0].geometry.coordinates;
          return { lat, lon };
        }
      } catch { return null; }
      return null;
    }

    async function optimizeCluster(cluster) {
      if (!ORS_API_KEY || cluster.length < 3) return cluster;
      const coords = [];
      for (const c of cluster) {
        const g = await geocode(c.address, c.city);
        if (g) coords.push({ ...c, ...g });
      }
      if (coords.length < 3) return cluster;
      const body = { coordinates: coords.map(x => [x.lon, x.lat]), optimize_waypoints: true };
      try {
        const resp = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
          method: "POST",
          headers: {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (!data?.features?.[0]) return cluster;
        const ordered = data.features[0].geometry.coordinates;
        // sorteer op volgorde van route
        const sorted = [];
        for (const [lon, lat] of ordered) {
          const near = coords.find(p =>
            Math.abs(p.lat - lat) < 0.001 && Math.abs(p.lon - lon) < 0.001
          );
          if (near && !sorted.includes(near)) sorted.push(near);
        }
        return sorted.length ? sorted : cluster;
      } catch {
        return cluster;
      }
    }

    // 7️⃣ Verdeel per member (max ±400 euro) met route optimalisatie
    const inserts = [];
    const buckets = members.map(m => ({ member: m, total: 0, items: [] }));

    for (const cluster of Object.values(clusters)) {
      const optimized = await optimizeCluster(cluster);
      for (const c of optimized) {
        const price = Number(c.price_inc || 0);
        let slot = buckets.find(b => b.total + price <= 400);
        if (!slot)
          slot = buckets.reduce((min, x) => (x.total < min.total ? x : min), buckets[0]);
        slot.items.push(c);
        slot.total += price;
      }
    }

    // 8️⃣ Opslaan
    for (const b of buckets) {
      for (const c of b.items) {
        inserts.push(pool.query(
          `INSERT INTO planning (id, contract_id, member_id, date, status, created_at)
           VALUES ($1,$2,$3,$4,'Gepland',now())`,
          [uuidv4(), c.id, b.member.id, planDate.toISOString()]
        ));
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

export default router;
