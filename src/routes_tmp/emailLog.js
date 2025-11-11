// routes/emailLog.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/** ✅ GET – alle e-mail logs (meest recent eerst) */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, c.name AS client_name
       FROM email_log e
       LEFT JOIN contacts c ON e.to_contact_id = c.id
       ORDER BY e.sent_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("DB error (email log get):", err);
    res.status(500).json({ error: "Database error while fetching email log" });
  }
});

/** ✅ POST – handmatige log (optioneel) */
router.post("/", async (req, res) => {
  try {
    const { toClientId, toEmail, type, invoiceId } = req.body;
    if (!toEmail || !type)
      return res.status(400).json({ error: "toEmail and type are required" });

    const insert = await pool.query(
      `INSERT INTO email_log (to_contact_id, to_email, type, invoice_id, sent_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING *`,
      [toClientId || null, toEmail, type, invoiceId || null]
    );

    res.status(201).json(insert.rows[0]);
  } catch (err) {
    console.error("DB error (email log insert):", err);
    res.status(500).json({ error: "Failed to insert email log" });
  }
});

export default router;
