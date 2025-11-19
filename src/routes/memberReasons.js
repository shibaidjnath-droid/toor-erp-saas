import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * Table: member_reasons
 * Columns: id UUID PRIMARY KEY, name TEXT UNIQUE, created_at TIMESTAMP
 */

router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM member_reasons ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Database error while fetching member reasons" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { value } = req.body;
    if (!value) return res.status(400).json({ error: "value is required" });

    const exists = await pool.query("SELECT * FROM member_reasons WHERE name=$1", [value]);
    if (exists.rows.length) return res.status(200).json(exists.rows[0]);

    const { rows } = await pool.query(`
      INSERT INTO member_reasons (id, name, created_at)
      VALUES ($1,$2,now())
      RETURNING *`,
      [uuidv4(), value]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Insert failed" });
  }
});

router.delete("/", async (req, res) => {
  try {
    const { value } = req.body;
    if (!value) return res.status(400).json({ error: "value required" });

    const result = await pool.query(
      "DELETE FROM member_reasons WHERE name=$1 RETURNING id",
      [value]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Reason not found" });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Delete error" });
  }
});

export default router;
