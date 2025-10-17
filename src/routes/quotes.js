// routes/quotes.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * Quote:
 * { id, clientId, title, amount, status, created_at }
 * status: 'draft' | 'sent' | 'accepted' | 'declined'
 */

/** ✅ GET – alle offertes (met klantnaam) */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT q.*, c.name AS client_name, c.email AS client_email
      FROM quotes q
      LEFT JOIN contacts c ON q.contact_id = c.id
      ORDER BY q.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("DB error (get quotes):", err);
    res.status(500).json({ error: "Database error while fetching quotes" });
  }
});

/** ✅ GET – offerte per ID */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT q.*, c.name AS client_name, c.email AS client_email
       FROM quotes q
       LEFT JOIN contacts c ON q.contact_id = c.id
       WHERE q.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Quote not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error (get quote):", err);
    res.status(500).json({ error: "Database error while fetching quote" });
  }
});

/** ✅ POST – nieuwe offerte */
router.post("/", async (req, res) => {
  try {
    const { clientId, title, amount } = req.body || {};
    if (!clientId) return res.status(400).json({ error: "clientId is required" });
    if (!title) return res.status(400).json({ error: "title is required" });

    // Controleer of klant bestaat
    const clientCheck = await pool.query("SELECT id FROM contacts WHERE id=$1", [clientId]);
    if (!clientCheck.rows.length)
      return res.status(404).json({ error: "Client not found" });

    const amt = isNaN(parseFloat(amount)) ? 0 : parseFloat(amount);
    const newQuote = {
      id: uuidv4(),
      clientId,
      title,
      amount: amt,
      status: "draft",
    };

    const { rows } = await pool.query(
      `INSERT INTO quotes (id, contact_id, title, amount, status, created_at)
       VALUES ($1,$2,$3,$4,$5,now())
       RETURNING *`,
      [newQuote.id, newQuote.clientId, newQuote.title, newQuote.amount, newQuote.status]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error (quote):", err);
    res.status(500).json({ error: "Failed to create quote" });
  }
});

/** ✅ PUT – offerte bijwerken */
router.put("/:id", async (req, res) => {
  try {
    const { title, amount, status } = req.body;
    let amt = amount !== undefined ? parseFloat(amount) : undefined;
    if (isNaN(amt)) amt = undefined;

    const validStatuses = ["draft", "sent", "accepted", "declined"];
    const statusVal = validStatuses.includes(status) ? status : undefined;

    const { rows } = await pool.query(
      `UPDATE quotes
       SET title = COALESCE($1, title),
           amount = COALESCE($2, amount),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING *`,
      [title, amt, statusVal, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: "Quote not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB update error (quote):", err);
    res.status(500).json({ error: "Database update failed" });
  }
});

export default router;
