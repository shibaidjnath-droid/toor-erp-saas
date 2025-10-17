// routes/clients.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// ✅ GET all clients
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM contacts ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ POST new client
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, address, tag } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Naam en e-mail verplicht" });

    const { rows } = await pool.query(
      `INSERT INTO contacts (name, email, phone, address, tag)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, email, phone, address, tag]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error:", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});

export default router;
