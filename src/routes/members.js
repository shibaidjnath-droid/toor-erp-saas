// routes/members.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * Member:
 * { id, name, email, phone, roles: string[], created_at }
 */

/** ✅ GET – alle members **/
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM members ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error("DB error (get members):", err);
    res.status(500).json({ error: "Database error while fetching members" });
  }
});

/** ✅ GET – één member **/
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM members WHERE id=$1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Member niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error (get member):", err);
    res.status(500).json({ error: "Database error while fetching member" });
  }
});

/** ✅ POST – nieuwe member **/
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, roles = [] } = req.body;
    if (!name) return res.status(400).json({ error: "Naam is verplicht" });

    const member = {
      id: uuidv4(),
      name,
      email: email || "",
      phone: phone || "",
      roles: Array.isArray(roles) ? roles : [],
    };

    const { rows } = await pool.query(
      `INSERT INTO members (id, name, email, phone, roles, created_at)
       VALUES ($1,$2,$3,$4,$5,now())
       RETURNING *`,
      [member.id, member.name, member.email, member.phone, member.roles]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error (member):", err);
    res.status(500).json({ error: "Failed to insert member" });
  }
});

/** ✅ PUT – member bijwerken **/
router.put("/:id", async (req, res) => {
  try {
    const { name, email, phone, roles } = req.body;
    const cleanRoles = Array.isArray(roles) ? roles : [];

    const { rows } = await pool.query(
      `UPDATE members
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           roles = COALESCE($4, roles)
       WHERE id = $5
       RETURNING *`,
      [name, email, phone, cleanRoles, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: "Member niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB update error (member):", err);
    res.status(500).json({ error: "Database update error" });
  }
});

/** ✅ DELETE – member verwijderen **/
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM members WHERE id=$1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Member niet gevonden" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DB delete error (member):", err);
    res.status(500).json({ error: "Database delete error" });
  }
});

export default router;
