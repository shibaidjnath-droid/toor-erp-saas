// routes/invoices.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/** ✅ GET – alle facturen **/
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        i.id,
        i.client_name,
        i.contract_id,
        i.planning_id,
        i.date,
        i.amount,
        i.method,
        i.status,
        i.created_at
      FROM invoices i
      ORDER BY i.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("DB error (get invoices):", err);
    res.status(500).json({ error: err.message });
  }
});
// GET – lijst met unieke methodes
router.get("/methods", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT LOWER(COALESCE(method, 'maandelijks')) AS method
      FROM invoices
      ORDER BY method ASC
    `);
    res.json(rows.map(r => r.method));
  } catch (err) {
    console.error("DB error (get invoice methods):", err);
    res.status(500).json({ error: err.message });
  }
});

/** ✅ GET – factuur per id **/
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
         i.id,
         i.client_name,
         i.contract_id,
         i.planning_id,
         i.date,
         i.amount,
         i.method,
         i.status,
         i.created_at
       FROM invoices i
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Factuur niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error (get invoice):", err);
    res.status(500).json({ error: "Database error" });
  }
});

/** ❌ Oude Mollie-POST uitgeschakeld (niet meer van toepassing) **/
router.post("/", (req, res) => {
  return res.status(410).json({
    error:
      "Mollie-betalingen zijn uitgeschakeld in deze versie. Facturen worden automatisch aangemaakt via Yuki-routes.",
  });
});

/** ✅ PUT – status bijwerken (bijv. betaald / fout / verzonden) **/
router.put("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is verplicht" });

    const { rows } = await pool.query(
      "UPDATE invoices SET status=$1, updated_at=now() WHERE id=$2 RETURNING *",
      [status, req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Factuur niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB update error:", err);
    res.status(500).json({ error: "Database update error" });
  }
});



export default router;
