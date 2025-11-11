// routes/purchases.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/** ✅ GET – alle aankopen (inkoop) */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM purchases ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("DB error (get purchases):", err);
    res.status(500).json({ error: "Database error while fetching purchases" });
  }
});

/** ✅ GET – aankoop per ID */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM purchases WHERE id=$1",
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: "Purchase not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error (get purchase):", err);
    res.status(500).json({ error: "Database error while fetching purchase" });
  }
});

/** ✅ POST – nieuwe aankoop */
router.post("/", async (req, res) => {
  try {
    const { supplier, description, amount, status } = req.body;
    if (!supplier)
      return res.status(400).json({ error: "Supplier is required" });

    const id = uuidv4();
    const amt = isNaN(parseFloat(amount)) ? 0 : parseFloat(amount);
    const stat = status || "open";

    const { rows } = await pool.query(
      `INSERT INTO purchases (id, supplier, description, amount, status, created_at)
       VALUES ($1,$2,$3,$4,$5,now())
       RETURNING *`,
      [id, supplier, description || "", amt, stat]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error (purchase):", err);
    res.status(500).json({ error: "Failed to create purchase" });
  }
});

/** ✅ PUT – aankoop bijwerken */
router.put("/:id", async (req, res) => {
  try {
    const { supplier, description, amount, status } = req.body;

    const { rows } = await pool.query(
      `UPDATE purchases
       SET supplier = COALESCE($1, supplier),
           description = COALESCE($2, description),
           amount = COALESCE($3, amount),
           status = COALESCE($4, status)
       WHERE id = $5
       RETURNING *`,
      [supplier, description, amount, status, req.params.id]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Purchase not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB update error (purchase):", err);
    res.status(500).json({ error: "Database update failed" });
  }
});

/** ✅ DELETE – aankoop verwijderen */
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM purchases WHERE id=$1 RETURNING id",
      [req.params.id]
    );
    if (!result.rowCount)
      return res.status(404).json({ error: "Purchase not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DB delete error (purchase):", err);
    res.status(500).json({ error: "Database delete failed" });
  }
});

export default router;
