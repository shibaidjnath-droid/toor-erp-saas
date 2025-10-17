// routes/planning.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * ✅ GET /api/planning?period=week|month|6weeks|3weeks|year&start=YYYY-MM-DD
 * Retourneert geplande bezoeken binnen het opgegeven venster.
 */
router.get("/", async (req, res) => {
  try {
    const { period = "week", start } = req.query;
    const startDate = start ? new Date(start) : new Date();
    const from = new Date(startDate);
    const to = new Date(startDate);

    // bepaal einddatum
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

    // Query alle actieve contracten met next_visit binnen venster
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

/**
 * ✅ PATCH /api/planning/:contractId/shift
 * { nextVisit: ISO } → handmatig planning schuiven
 */
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

export default router;
