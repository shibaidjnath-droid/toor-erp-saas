// routes/serviceTypes.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * Table: service_types
 * Columns: id UUID PRIMARY KEY, name TEXT UNIQUE, created_at TIMESTAMP
 */

/** ✅ GET – alle servicetypen */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM service_types ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    console.error("DB error (get service types):", err);
    res.status(500).json({ error: "Database error while fetching service types" });
  }
});

/** ✅ POST – nieuw servicetype toevoegen */
router.post("/", async (req, res) => {
  try {
    const { value } = req.body;
    if (!value) return res.status(400).json({ error: "value required" });

    // check of type al bestaat
    const check = await pool.query("SELECT * FROM service_types WHERE name = $1", [value]);
    if (check.rows.length) return res.status(200).json(check.rows[0]);

    const { rows } = await pool.query(
      `INSERT INTO service_types (id, name, created_at)
       VALUES ($1, $2, now())
       RETURNING *`,
      [uuidv4(), value]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error (service type):", err);
    res.status(500).json({ error: "Failed to insert service type" });
  }
});

/** ✅ DELETE – servicetype verwijderen */
router.delete("/", async (req, res) => {
  try {
    const { value } = req.body;
    if (!value) return res.status(400).json({ error: "value required" });

    const result = await pool.query("DELETE FROM service_types WHERE name = $1 RETURNING id", [value]);
    if (!result.rowCount) return res.status(404).json({ error: "Service type not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DB delete error (service type):", err);
    res.status(500).json({ error: "Database delete error" });
  }
});

export default router;
