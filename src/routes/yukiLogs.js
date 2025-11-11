// routes/yukiLog.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * ✅ GET /api/yuki-log
 * Haalt alle facturatie-logrecords uit tabel public.yuki_invoice_log
 */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, created_at, planning_id, client_name, email, amount, succeeded, message, xml_response
       FROM yuki_invoice_log
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen Yuki facturatie log:", err);
    res.status(500).json({ error: "Databasefout bij ophalen facturatie log" });
  }
});

/**
 * ✅ (optioneel) GET /api/yuki-log/:planningId
 * Filtert op specifiek planning_id (handig voor debug/detail)
 */
router.get("/:planningId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM yuki_invoice_log WHERE planning_id = $1 ORDER BY created_at DESC`,
      [req.params.planningId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen Yuki log voor planning:", err);
    res.status(500).json({ error: "Databasefout bij ophalen planning log" });
  }
});

export default router;
