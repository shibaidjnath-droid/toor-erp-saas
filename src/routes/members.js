// routes/members.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * Member:
 * id, name, email, phone, roles[], active, reden, van_date, end_date (tot_date)
 */

/** Helper: save history **/
async function saveHistory(before, after) {
  await pool.query(
    `INSERT INTO member_history
     (id, member_id, reden, van_date, tot_date, active_before, active_after, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [
      uuidv4(),
      before.id,
      after.reden || before.reden || null,
      after.van_date || before.van_date || null,
      after.end_date || before.end_date || null,
      before.active,
      after.active
    ]
  );
}

/** ================================
 *   GET ALL
 * ================================ */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
  SELECT
    id,
    name,
    email,
    phone,
    roles,
    active,
    reden,
    to_char(van_date, 'YYYY-MM-DD') AS van_date,
    to_char(end_date, 'YYYY-MM-DD') AS end_date,
    created_at
  FROM members
  ORDER BY created_at DESC
`);

    // automatische reactivatie (fallback only)
    const today = new Date().toISOString().split("T")[0];

    for (const m of rows) {
      if (m.end_date && m.end_date < today && m.active === false) {
        await pool.query(
          `UPDATE members SET active=true WHERE id=$1`,
          [m.id]
        );
        await saveHistory(m, { active: true });
      }
    }

    res.json(rows);
  } catch (err) {
    console.error("DB error (get members):", err);
    res.status(500).json({ error: "Database error while fetching members" });
  }
});

/** ================================
 *   GET ONE
 * ================================ */
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
  SELECT
    id,
    name,
    email,
    phone,
    roles,
    active,
    reden,
    to_char(van_date, 'YYYY-MM-DD') AS van_date,
    to_char(end_date, 'YYYY-MM-DD') AS end_date,
    created_at
  FROM members
  WHERE id=$1
`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Member niet gevonden" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error (get member):", err);
    res.status(500).json({ error: "Database error while fetching member" });
  }
});

/** ================================
 *   POST NEW
 * ================================ */
router.post("/", async (req, res) => {
  try {
    const {
      name, email, phone,
      roles = [],
      active = true,
      reden = null,
      van_date = null,
      end_date = null
    } = req.body;

    if (!name) return res.status(400).json({ error: "Naam is verplicht" });

    // validatie
    if (!active && !reden) {
      return res.status(400).json({ error: "Reden is verplicht indien inactief" });
    }

    const memberId = uuidv4();

    const { rows } = await pool.query(
      `INSERT INTO members
       (id, name, email, phone, roles, active, reden, van_date, end_date, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       RETURNING *`,
      [
        memberId,
        name,
        email || "",
        phone || "",
        roles,
        active,
        reden,
        van_date || null,
        end_date || null
      ]
    );

    // log history
    await saveHistory(
      { id: memberId, active: true },
      { active: active, reden, van_date, end_date }
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("DB insert error (member):", err);
    res.status(500).json({ error: "Failed to insert member" });
  }
});

/** ================================
 *   UPDATE MEMBER
 * ================================ */
router.put("/:id", async (req, res) => {
  try {
    // 1️⃣ OLD MEMBER
    const { rows: beforeRows } = await pool.query(
      "SELECT * FROM members WHERE id=$1",
      [req.params.id]
    );

    if (!beforeRows.length)
      return res.status(404).json({ error: "Member niet gevonden" });

    const before = beforeRows[0];

    // 2️⃣ INPUT
    const {
      name,
      email,
      phone,
      roles = [],
      active,
      reden,
      van_date,
      end_date
    } = req.body;

    // validatie
    if (active === false && !reden) {
      return res.status(400).json({ error: "Reden is verplicht indien inactief" });
    }

    const safeVan = van_date && van_date.trim() !== "" ? van_date : null;
    const safeTot = end_date && end_date.trim() !== "" ? end_date : null;

    // 3️⃣ UPDATE
    const { rows: updatedRows } = await pool.query(
      `UPDATE members
         SET name = COALESCE($1,name),
             email = COALESCE($2,email),
             phone = COALESCE($3,phone),
             roles = COALESCE($4,roles),
             active = COALESCE($5,active),
             reden = COALESCE($6,reden),
             van_date = COALESCE($7,van_date),
             end_date = COALESCE($8,end_date)
       WHERE id=$9
       RETURNING *`,
      [
        name,
        email,
        phone,
        roles,
        active,
        reden,
        safeVan,
        safeTot,
        req.params.id
      ]
    );

    let after = updatedRows[0];

    // 4️⃣ OPSCHOONREGEL: indien actief → velden wissen
    if (after.active === true && (after.reden || after.van_date || after.end_date)) {
      const cleaner = await pool.query(
        `UPDATE members
           SET reden = NULL,
               van_date = NULL,
               end_date = NULL
         WHERE id=$1
         RETURNING *`,
        [req.params.id]
      );
      after = cleaner.rows[0];
    }

    // -------------------------------------------------------------
    // 🧠 5️⃣ SLIMME PLANNING TRIGGER LOGICA
    // -------------------------------------------------------------

    try {
      const previous = before;
      const current = after;

      const reden = current.reden;
      const van = current.van_date;
      const tot = current.end_date;

      const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;

      // ❗ 1) ACTIEF → INACTIEF
      if (previous.active === true && current.active === false) {

        // --- A: ZIEK ---
        if (reden === "Ziek") {
          await fetch(`${baseUrl}/api/planning/unassign-for-member/${current.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reden, van, tot })
          });
        }

        // --- B: VAKANTIE ---
        else if (reden === "Vakantie") {
          await fetch(`${baseUrl}/api/planning/unassign-for-member/${current.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reden, van, tot })
          });

          await fetch(`${baseUrl}/api/planning/reassign-freed/${current.id}`, {
            method: "POST"
          });
        }

        // --- C: GESTOPT ---
        else if (reden === "Niet meer werkzaam bij ons") {
          await fetch(`${baseUrl}/api/planning/unassign-for-member/${current.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reden, van })
          });

          await fetch(`${baseUrl}/api/planning/reassign-freed/${current.id}`, {
            method: "POST"
          });
        }
      }

      // ❗ 2) ACTIEF → ACTIEF (reden/datum wijziging)
      else if (previous.active === true && current.active === true) {

        const reasonChanged = previous.reden !== current.reden;
        const datesChanged =
          previous.van_date !== current.van_date ||
          previous.end_date !== current.end_date;

        if (reasonChanged || datesChanged) {
          if (reden === "Vakantie") {
            await fetch(`${baseUrl}/api/planning/unassign-for-member/${current.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reden, van, tot })
            });

            await fetch(`${baseUrl}/api/planning/reassign-freed/${current.id}`, {
              method: "POST"
            });
          }
        }
      }

    } catch (triggerErr) {
      console.error("⚠️ Planning-trigger fout:", triggerErr);
    }

    // -------------------------------------------------------------
    // 6️⃣ SAVE HISTORY + RETURN
    // -------------------------------------------------------------

    await saveHistory(before, after);

    res.json(after);

  } catch (err) {
    console.error("DB update error (member):", err);
    res.status(500).json({ error: "Database update error" });
  }
});



/** ================================
 *   DELETE MEMBER
 * ================================ */
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
/** ==========================================
 *  GET MEMBER HISTORY
 * ========================================== */
router.get("/:id/history", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT *
       FROM member_history
       WHERE member_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ History fetch error:", err);
    res.status(500).json({ error: "History fetch failed" });
  }
});

export default router;
