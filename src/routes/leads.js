// routes/leads.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/** ✅ GET – alle leads **/
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM leads ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("DB error (get leads):", err);
    res.status(500).json({ error: "Database error while fetching leads" });
  }
});

/** ✅ POST – nieuwe lead **/
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, source, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const result = await pool.query(
      `INSERT INTO leads (id, name, email, phone, source, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [
        uuidv4(),
        name,
        email || "",
        phone || "",
        source || "manual",
        notes || "",
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("DB insert error (lead):", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});

export default router;
