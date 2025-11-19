// routes/planning.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { rebuildSeriesForContract } from "./planningHelpers.js";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const router = express.Router();

console.log("✅ planning.js geladen");

/* ===========================================================
   🗓 Kalender-hulpfuncties
   =========================================================== */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeekMonday(d) {
  const x = startOfDay(d);
  const day = x.getDay() || 7;
  return addDays(x, -(day - 1));
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
}
function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0);
}
function startOfNextYear(d) {
  return new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0);
}

/* ===========================================================
   📅 ISO-weeknummer
   =========================================================== */
function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/* ===========================================================
   📅 NL RESOLVERANGE (GEEN UTC, GEEN SHIFTING)
   =========================================================== */

function toISO(date) {
  // Genereer een pure YYYY-MM-DD (zonder UTC drift)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDayNL(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
}

function endOfDayNL(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

function getMondayNL(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=zo,1=ma,2=di...

  const diff = day === 0 ? -6 : 1 - day; // zondag → maandag van dezelfde week
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 0, 0, 0);
}

function getFridayNL(date) {
  const mon = getMondayNL(date);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4, 23, 59, 59);
}

function startOfMonthNL(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
}

function endOfMonthNL(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

function resolveRange(rangeLabel, startParam) {
  const now = new Date();
  const label = String(rangeLabel || "").toLowerCase();

  let startDate = null;
  if (startParam) {
    // Specifieke datum (yyyy-mm-dd via datepicker)
    const dt = new Date(startParam);
    startDate = !isNaN(dt) ? dt : null;
  }

  let from;
  let to;

  switch (label) {
    case "vandaag":
    case "today":
      from = startOfDayNL(now);
      to = endOfDayNL(now);
      break;

    case "morgen":
    case "tomorrow":
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      from = startOfDayNL(tomorrow);
      to = endOfDayNL(tomorrow);
      break;

    case "deze week":
    case "week":
      from = getMondayNL(now);
      to = getFridayNL(now);
      break;

    case "deze maand":
    case "month":
      from = startOfMonthNL(now);
      to = endOfMonthNL(now);
      break;

    case "specifieke datum":
    case "date":
      if (!startDate) startDate = now;
      from = startOfDayNL(startDate);
      to = endOfDayNL(startDate);
      break;

    case "alles":
    case "all":
      from = new Date(now.getFullYear() - 5, 0, 1);
      to = new Date(now.getFullYear() + 5, 11, 31, 23, 59, 59);
      break;

    default:
      // fallback = huidige week
      from = getMondayNL(now);
      to = getFridayNL(now);
  }

  return [toISO(from), toISO(to)];
}


/* ===========================================================
   🔁 computeNextVisit
   =========================================================== */
export function computeNextVisit(lastVisit, frequency) {
  const base = lastVisit ? new Date(lastVisit) : new Date();
  const d = new Date(base);

  switch (frequency) {
    case "3 weken": d.setDate(d.getDate() + 21); break;
    case "4 weken": d.setDate(d.getDate() + 28); break;
    case "6 weken": d.setDate(d.getDate() + 42); break;
    case "8 weken": d.setDate(d.getDate() + 56); break;
    case "12 weken": d.setDate(d.getDate() + 84); break;
    case "Maand": d.setMonth(d.getMonth() + 1); break;
    case "3 keer per jaar": d.setMonth(d.getMonth() + 4); break;
    case "1 keer per jaar": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }

  return d.toISOString();
}

/* ===========================================================
   🗓️ GET /api/planning/schedule  (complete herbouw)
   =========================================================== */
router.get("/schedule", async (req, res) => {
  try {
    const { range = "all", memberId, status, week, start } = req.query;

    const [fromIso, toIso] = resolveRange(range, start);

    const conditions = [];
    const params = [];

    if (range !== "all") {
      params.push(fromIso, toIso);
      conditions.push(`p.date::date BETWEEN $${params.length - 1} AND $${params.length}`);
    }

    if (memberId) {
      params.push(memberId);
      conditions.push(`p.member_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    if (week) {
      params.push(parseInt(week, 10));
      conditions.push(`p.week_number = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        p.id, p.contract_id, p.member_id, p.date, p.week_number,
        p.status, p.comment, p.cancel_reason, p.invoiced,
        c.contact_id AS client_id, ct.name AS customer,
        ct.address, ct.house_number, ct.city,
        m.name AS member_name
      FROM planning p
      JOIN contracts c ON p.contract_id = c.id
      JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN members m ON p.member_id = m.id
      ${whereClause}
      ORDER BY p.date ASC, customer ASC
    `;

    const { rows } = await pool.query(sql, params);

    res.json({
      items: rows,
      range,
      appliedFilters: { memberId, status, week, range }
    });
  } catch (err) {
    console.error("❌ Planning schedule fetch error:", err);
    res.status(500).json({ error: "Database error while fetching schedule" });
  }
});
/* ===========================================================
   🧠 SLIMME AUTO-ASSIGN MET €-GRENS + REGIOCLUSTERING
   =========================================================== */
router.post("/auto-assign/:id", async (req, res) => {
  const planningId = req.params.id;
  console.log(`🧠 Auto-assign gestart voor planning ${planningId}`);

  try {
    // 1️⃣ Planning + klantinfo
    const { rows: planRows } = await pool.query(`
      SELECT p.id, p.date::date AS plan_date,
             c.id AS contract_id, c.price_inc,
             ct.id AS contact_id, ct.city, ct.status AS client_status
      FROM planning p
      JOIN contracts c ON p.contract_id = c.id
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE p.id = $1
    `, [planningId]);

    if (!planRows.length)
      return res.status(404).json({ error: "Planning niet gevonden" });

    const plan = planRows[0];
    const { plan_date, city, client_status } = plan;

    if (client_status !== "Active") {
      console.warn("⛔ Klant is inactief — geen member toegewezen");
      return res.json({ warning: "Klant niet actief" });
    }

    // 2️⃣ Alle actieve members ophalen
    const { rows: members } = await pool.query(`
      SELECT id, name FROM members WHERE active = true
    `);
    if (!members.length) {
      console.warn("⚠️ Geen actieve members");
      return res.json({ warning: "Geen actieve members" });
    }

    // 3️⃣ Dagload (€) per member
    const { rows: loads } = await pool.query(`
      SELECT m.id AS member_id, COALESCE(SUM(c.price_inc),0) AS total_value
      FROM members m
      LEFT JOIN planning p ON m.id = p.member_id AND p.date::date = $1
      LEFT JOIN contracts c ON p.contract_id = c.id
      WHERE m.active = true
      GROUP BY m.id
    `, [plan_date]);

    const loadMap = Object.fromEntries(
      loads.map(l => [l.member_id, parseFloat(l.total_value || 0)])
    );
    console.log("\n================= AUTO-ASSIGN DEBUG START =================");
console.log("📆 Datum:", plan_date);
console.log("📍 Stad klant:", city);
console.log("👥 Beschikbare members:", members.map(m => m.name).join(", "));
console.log("💶 Dagwaardes:", loadMap);

    // 4️⃣ Regio-matching (stad)
    const candidatePromises = members.map(async m => {
      const sameCityRes = await pool.query(`
        SELECT COUNT(*)::int AS same_city_hits
        FROM planning p
        JOIN contracts c2 ON p.contract_id = c2.id
        JOIN contacts ct2 ON c2.contact_id = ct2.id
        WHERE p.member_id = $1 AND LOWER(ct2.city) = LOWER($2)
      `, [m.id, city]);

      const sameCityHits = sameCityRes.rows[0]?.same_city_hits || 0;
      const totalValue = loadMap[m.id] || 0;
      const score = totalValue - sameCityHits * 50;

      return { ...m, sameCityHits, totalValue, score };
    });

    const candidates = await Promise.all(candidatePromises);
    console.log("🔍 Candidates detail:");
candidates.forEach(c => {
  console.log(`- ${c.name}: totalValue=${c.totalValue}, sameCityHits=${c.sameCityHits}, score=${c.score}`);
});


    const filtered = candidates.filter(c => c.totalValue < 500);
console.log("🎚 Daglimiet filtering (<500 EUR):");
console.log("  → Kandidaten onder 500:", filtered.map(f => f.name));
console.log("  → Indien leeg → fallback op alle candidates");
    const sorted =
      filtered.length
        ? filtered.sort((a, b) => a.score - b.score)
        : candidates.sort((a, b) => a.score - b.score);

    const chosen = sorted[0];
    console.log("🏆 GEKOZEN MEMBER:", chosen?.name || "NONE");
console.log("================= AUTO-ASSIGN DEBUG END =================\n");

    if (!chosen) {
      console.warn("⚠️ Geen geschikte member gevonden");
      return res.json({ warning: "Geen geschikte member" });
    }

    await pool.query(
      `UPDATE planning SET member_id = $1 WHERE id = $2`,
      [chosen.id, planningId]
    );

    console.log(
      `✅ Slim toegewezen member '${chosen.name}' aan planning ${planningId}`
    );

    res.json({
      ok: true,
      assignedMember: chosen.name,
      dayValue: chosen.totalValue,
      sameCityHits: chosen.sameCityHits
    });
  } catch (err) {
    console.error("❌ Auto-assign fout:", err);
    res.status(500).json({ error: "Auto-assign mislukt" });
  }
});

/* ===========================================================
   🧠 AUTO-ASSIGN ALLE PLANNING VAN ÉÉN CONTRACT (BATCH)
   =========================================================== */
router.post("/auto-assign/contract/:contractId", async (req, res) => {
  try {
    const { contractId } = req.params;

    const { rows: plannings } = await pool.query(
      `SELECT id FROM planning 
       WHERE contract_id = $1 AND member_id IS NULL`,
      [contractId]
    );

    if (!plannings.length) {
      return res.json({ ok: true, count: 0 });
    }

    const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;

    for (const p of plannings) {
      try {
        await fetch(
          `${baseUrl}/api/planning/auto-assign/${p.id}`,
          { method: "POST" }
        );
      } catch (e) {
        console.warn("⚠️ Auto-assign call failed:", e.message);
      }
    }

    res.json({ ok: true, count: plannings.length });
  } catch (err) {
    console.error("❌ Batch auto-assign fout:", err);
    res.status(500).json({ error: "Batch auto-assign mislukt" });
  }
});

/* ===========================================================
   🆕 POST /api/planning  (Ad-hoc planningrecord aanmaken)
   =========================================================== */
router.post("/", async (req, res) => {
  try {
    const { contractId, memberId, date, status = "Gepland", comment = null, invoiced = false } = req.body;

    if (!contractId || !date)
      return res.status(400).json({ error: "contractId en date zijn verplicht" });

    const dt = new Date(date);
    const iso = dt.toISOString().split("T")[0];   // FIX ipv toLocale
    const weekNumber = getIsoWeekNumber(dt);

    const { rows } = await pool.query(
      `INSERT INTO planning 
        (id, contract_id, member_id, date, week_number, status, comment, invoiced, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       RETURNING *`,
      [
        uuidv4(),
        contractId,
        memberId || null,
        iso,
        weekNumber,
        status,
        comment,
        !!invoiced
      ]
    );

    const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;

    try {
      await fetch(`${baseUrl}/api/planning/auto-assign/${rows[0].id}`, {
        method: "POST",
      });
    } catch (e) {
      console.warn("Auto-assign mislukt:", e.message);
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Planning create error:", err);
    res.status(500).json({ error: "Failed to create planning item" });
  }
});

/* ===========================================================
   🔁 REBUILD via front-end
   =========================================================== */
router.post("/rebuild/:contractId", async (req, res) => {
  try {
    const { contractId } = req.params;
    const { startDate } = req.body || {};

    const count = await rebuildSeriesForContract(contractId, {
      resetExisting: true,
      startDate,
      logPrefix: "FRONTEND rebuild – "
    });

    res.json({ ok: true, count });
  } catch (err) {
    console.error("Rebuild error:", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to rebuild planning" });
  }
});
/* ===========================================================
   📤 SHARE PLANNING — stuur planning via WhatsApp + Screenshot
   =========================================================== */
router.post("/share", async (req, res) => {
  try {
    const { periode } = req.body;
    if (!periode)
      return res.status(400).json({ error: "Periode is verplicht" });

    // ====== 📅 Bereken tijdsrange ======
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (periode) {
      case "Voor Morgen":
        start.setDate(now.getDate() + 1);
        end.setDate(now.getDate() + 1);
        break;

      case "Deze Week":
        start.setDate(now.getDate() - (now.getDay() || 7) + 1);
        end.setDate(start.getDate() + 6);
        break;

      case "Deze Maand":
        start.setDate(1);
        end.setMonth(start.getMonth() + 1);
        end.setDate(0);
        break;

      default:
        return res.status(400).json({ error: "Ongeldige periode" });
    }

    // Zorg dat datums ISO zijn
    const startIso = start.toISOString();
    const endIso = new Date(end.setHours(23, 59, 59, 999)).toISOString();

    // ====== 🗓️ Planning ophalen ======
    const { rows: planning } = await pool.query(`
      SELECT 
        p.*, 
        m.name AS member_name, 
        m.phone AS member_phone,
        c.name AS klant, 
        c.address, 
        c.house_number,
        c.city
      FROM planning p
      JOIN contracts ct ON p.contract_id = ct.id
      JOIN contacts c ON ct.contact_id = c.id
      LEFT JOIN members m ON p.member_id = m.id
      WHERE p.date::date BETWEEN $1 AND $2
        AND p.status != 'Geannuleerd'
      ORDER BY m.name, p.date ASC
    `, [startIso, endIso]);

    if (!planning.length) {
      return res.status(400).json({ error: "Geen planning gevonden" });
    }

    // ====== 🧩 GROEPEREN PER MEMBER ======
    const grouped = {};
    for (const p of planning) {
      if (!grouped[p.member_id]) grouped[p.member_id] = [];
      grouped[p.member_id].push(p);
    }

    // ====== 📂 Zorg dat /screenshots map bestaat ======
    const screenshotsDir = path.join(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // ====== 🧪 Puppeteer opstarten (crash-safe) ======
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch (e) {
      console.error("❌ Puppeteer kon niet starten:", e.message);
      return res.status(500).json({
        error: "Kon browser niet starten (Puppeteer)",
      });
    }

    const page = await browser.newPage();
    const sent = [];

    // ====== 📸 Voor elke member een screenshot maken ======
    for (const [memberId, items] of Object.entries(grouped)) {
      const member = items[0];

      // HTML genereren
      const html = `
        <html>
        <head>
          <style>
            body { font-family: Arial; padding: 20px; }
            h3 { margin-bottom: 10px; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #ccc; padding: 6px; font-size: 13px; }
          </style>
        </head>
        <body>
          <h3>Planning voor ${periode} – ${member.member_name}</h3>
          <table>
            <tr>
              <th>Datum</th>
              <th>Klant</th>
              <th>Adres</th>
              <th>Stad</th>
              <th>Opmerking</th>
            </tr>
            ${items
              .map((i) => {
                const d =
                  typeof i.date === "string"
                    ? i.date.split("T")[0]
                    : new Date(i.date).toISOString().split("T")[0];

                return `
                  <tr>
                    <td>${d}</td>
                    <td>${i.klant}</td>
                    <td>${i.address || ""} ${i.house_number || ""}</td>
                    <td>${i.city}</td>
                    <td>${i.comment || "-"}</td>
                  </tr>
                `;
              })
              .join("")}
          </table>
        </body>
        </html>
      `;

      await page.setContent(html, { waitUntil: "networkidle0" });

      const filePath = path.join(
        screenshotsDir,
        `planning_${member.member_name}.png`
      );

      await page.screenshot({ path: filePath, fullPage: true });

      // === WhatsApp versturen ===
      const phone = member.member_phone?.replace(/\D/g, "");
      if (phone) {
        try {
          await fetch(`${process.env.APP_URL}/api/whatsapp/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone,
              message: `Hi ${member.member_name}, hierbij de planning voor ${periode}.`,
              filePath: path.resolve(filePath).replace(/\\/g, "/"),
            }),
          });
          sent.push(phone);
        } catch (e) {
          console.warn(
            `⚠️ WhatsApp versturen mislukt naar ${phone}:`,
            e.message
          );
        }
      } else {
        console.warn(
          `⚠️ Geen telefoonnummer voor member '${member.member_name}'`
        );
      }
    }

    await browser.close();

    res.json({ ok: true, sentCount: sent.length });
  } catch (err) {
    console.error("❌ Deel planning error:", err);
    res.status(500).json({ error: "Fout bij delen planning" });
  }
});
/* ===========================================================
   ✏️ PUT /api/planning/:id – planning record bijwerken
   =========================================================== */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { date, memberId, status, comment, invoiced, cancel_reason } = req.body;

    // Bestaat het record?
    const check = await pool.query(
      "SELECT id FROM planning WHERE id = $1 LIMIT 1",
      [id]
    );
    if (!check.rows.length)
      return res.status(404).json({ error: "Planning niet gevonden" });

    const updates = [];
    const params = [];
    let i = 1;

    // 1️⃣ Datum + weeknummer
    if (date) {
      const dt = new Date(date);
      const iso = dt.toISOString().split("T")[0];

      updates.push(`date = $${i++}`);
      params.push(iso);

      updates.push(`week_number = $${i++}`);
      params.push(getIsoWeekNumber(dt));
    }

    // 2️⃣ Member
    if (memberId) {
      updates.push(`member_id = $${i++}`);
      params.push(memberId);
    }

    // 3️⃣ Status
    if (status) {
      updates.push(`status = $${i++}`);
      params.push(status);
    }

    // 4️⃣ Comment
    if (comment !== undefined) {
      updates.push(`comment = $${i++}`);
      params.push(comment);
    }

    // 5️⃣ Invoiced boolean
    if (invoiced !== undefined) {
      updates.push(`invoiced = $${i++}`);
      params.push(invoiced);
    }

    // 6️⃣ Cancel reason — alleen als status Geannuleerd is
    if (status === "Geannuleerd") {
      updates.push(`cancel_reason = $${i++}`);
      params.push(cancel_reason || null);
    }

    if (!updates.length)
      return res.status(400).json({ error: "Geen velden om bij te werken" });

    const sql = `
      UPDATE planning
      SET ${updates.join(", ")}, updated_at = now()
      WHERE id = $${i}
      RETURNING *;
    `;
    params.push(id);

    const { rows } = await pool.query(sql, params);

    res.json(rows[0]);
    console.log(`✅ Planning ${id} bijgewerkt`);

  } catch (err) {
    console.error("❌ Planning update error:", err);
    res.status(500).json({ error: "Fout bij bijwerken planning" });
  }
});

/* ===========================================================
   📄 FACTURATIE: /period-preview/facturatie  (NIEUW PAD!)
   =========================================================== */
router.get("/period-preview/facturatie", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate en endDate zijn verplicht",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT 
        p.id, 
        p.date, 
        p.status, 
        p.invoiced,
        c.name AS client_name,
        ct.description, 
        ct.price_inc, 
        ct.vat_pct
      FROM planning p
      JOIN contracts ct ON p.contract_id = ct.id
      JOIN contacts c ON ct.contact_id = c.id
      WHERE p.date::date BETWEEN $1 AND $2
        AND p.status NOT IN ('Geannuleerd','Gepland')
        AND p.invoiced = false
        AND (ct.maandelijkse_facturatie = false OR ct.maandelijkse_facturatie IS NULL)
      ORDER BY p.date
    `,
      [startDate, endDate]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Facturatie preview fout:", err.message);
    res.status(500).json({
      error: "Databasefout bij ophalen facturatie preview",
    });
  }
});

/* ===========================================================
   🏷️ GET /tag-preview (Facturatie per tag)
   =========================================================== */
router.get("/tag-preview", async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag)
      return res.status(400).json({ error: "Tag is verplicht" });

    const { rows } = await pool.query(
      `
      SELECT 
        p.id, 
        p.date, 
        p.status, 
        p.invoiced,
        c.name AS client_name,
        ct.description, 
        ct.price_inc, 
        ct.vat_pct
      FROM planning p
      JOIN contracts ct ON p.contract_id = ct.id
      JOIN contacts c ON ct.contact_id = c.id
      WHERE $1 IN (SELECT jsonb_array_elements_text(c.tag))
        AND p.status NOT IN ('Geannuleerd','Gepland')
        AND p.invoiced = false
        AND (ct.maandelijkse_facturatie = false OR ct.maandelijkse_facturatie IS NULL)
      ORDER BY p.date
    `,
      [tag]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Tag preview fout:", err.message);
    res.status(500).json({
      error: "Databasefout bij ophalen tag preview",
    });
  }
});

/* ===========================================================
   🔎 SEARCH — snelle zoekfunctie voor facturatie modal
   =========================================================== */
router.get("/search", async (req, res) => {
  try {
    // Voorkom caching (Render/Cloudflare)
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const term = (req.query.term || "").toLowerCase();
    if (!term) return res.json([]);

    const { rows } = await pool.query(
      `
      SELECT 
        p.id,
        p.date,
        ct.name AS client_name,
        ct.address,
        ct.house_number,
        ct.city,
        c.id AS contract_id
      FROM planning p
      JOIN contracts c ON p.contract_id = c.id
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE (
            LOWER(ct.name) LIKE '%' || $1 || '%'
         OR LOWER(ct.address) LIKE '%' || $1 || '%'
         OR LOWER(ct.city) LIKE '%' || $1 || '%'
         OR TO_CHAR(p.date, 'YYYY-MM-DD') LIKE '%' || $1 || '%'
      )
        AND p.status NOT IN ('Geannuleerd','Gepland')
        AND (p.invoiced = false OR p.invoiced IS NULL)
        AND (c.maandelijkse_facturatie = false OR c.maandelijkse_facturatie IS NULL)
      ORDER BY p.date DESC
      LIMIT 50
    `,
      [term]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ planning search error:", err);
    res.status(500).json({ error: "Database search error" });
  }
});

/* ===========================================================
   🆕 BULK UPDATE preview (NIEUW PAD!)
   =========================================================== */
router.get("/period-preview/bulk", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: "startDate en endDate zijn verplicht",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT 
        p.id,
        p.date,
        p.status,
        p.invoiced,
        p.contract_id,
        c.name AS client_name,
        ct.description,
        ct.price_inc
      FROM planning p
      JOIN contracts ct ON p.contract_id = ct.id
      JOIN contacts c ON ct.contact_id = c.id
      WHERE p.date::date BETWEEN $1 AND $2
        AND p.status = 'Gepland'
      ORDER BY p.date ASC
    `,
      [startDate, endDate]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ BULK preview fout:", err);
    res.status(500).json({ error: "Preview ophalen mislukt" });
  }
});

/* ===========================================================
   🧹 BULK COMPLETE endpoint
   =========================================================== */
router.post("/bulk-complete", async (req, res) => {
  try {
    const { selectedIds = [] } = req.body;

    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return res.status(400).json({
        error: "Geen planning IDs ontvangen",
      });
    }

    const { rowCount } = await pool.query(
      `
      UPDATE planning
      SET status = 'Afgerond'
      WHERE id = ANY($1)
    `,
      [selectedIds]
    );

    res.json({
      ok: true,
      updated: rowCount,
    });
  } catch (err) {
    console.error("❌ bulk-complete error:", err);
    res.status(500).json({ error: "Bulk update mislukt" });
  }
});
/* ===========================================================
   EINDE ROUTES — EXPORT
   =========================================================== */
/** 🔄 Geef planning vrij voor een member (ziek/vakantie/gestopt) */
router.post("/unassign-for-member/:memberId", async (req, res) => {
  try {
    const memberId = req.params.memberId;
    const { reden, van, tot } = req.body;

    if (!memberId || !reden) {
      return res.status(400).json({ error: "MemberId en reden verplicht" });
    }

    const vanDate = van ? new Date(van) : null;
    const totDate = tot ? new Date(tot) : null;

    let where = "";
    const params = [memberId];

    // 🔥 Reden-specifieke logica
    if (reden === "Ziek") {
      // Alleen tussen van–tot
      where = `AND p.date::date BETWEEN $2 AND $3`;
      params.push(vanDate.toISOString().split("T")[0]);
      params.push(totDate.toISOString().split("T")[0]);
    }

    else if (reden === "Vakantie") {
      // Zelfde selectie als Ziek
      where = `AND p.date::date BETWEEN $2 AND $3`;
      params.push(vanDate.toISOString().split("T")[0]);
      params.push(totDate.toISOString().split("T")[0]);
    }

    else if (reden === "Niet meer werkzaam bij ons") {
      // Vanaf VAN datum
      where = `AND p.date::date >= $2`;
      params.push(vanDate.toISOString().split("T")[0]);
    }

    else {
      return res.status(400).json({ error: "Onbekende reden" });
    }

    const sql = `
      UPDATE planning p
      SET member_id = NULL
      WHERE p.member_id = $1
        AND p.status = 'Gepland'
        ${where}
      RETURNING id;
    `;

    const { rows } = await pool.query(sql, params);

    res.json({ ok: true, freedCount: rows.length, freed: rows.map(r => r.id) });
    console.log(`🔄 Planning vrijgegeven voor member ${memberId} (${reden}) → ${rows.length} items`);
  } catch (err) {
    console.error("❌ Error in unassign-for-member:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** 🤖 Auto-assign voor alle planningen zonder member */
router.post("/reassign-freed/:memberId", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id
      FROM planning
      WHERE member_id IS NULL
        AND status = 'Gepland'
      ORDER BY date ASC
    `);

    if (!rows.length) {
      return res.json({ ok: true, reassigned: 0 });
    }

    const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;

    for (const p of rows) {
      await fetch(`${baseUrl}/api/planning/auto-assign/${p.id}`, {
        method: "POST"
      });
    }

    console.log(`🤖 Auto-assign uitgevoerd voor ${rows.length} vrijgegeven planningen`);

    res.json({ ok: true, reassigned: rows.length });

  } catch (err) {
    console.error("❌ Error in reassign-freed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;


