// routes/planning.js
import express from "express";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { rebuildSeriesForContract } from "./planningHelpers.js";
console.log("✅ planning.js geladen");
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";



const router = express.Router();


/* ===========================================================
   🧭 Kalender-hulpfuncties (NL & EN labels ondersteund)
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
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function startOfNextYear(d) {
  return new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
}

/* ===========================================================
   📅 ISO-weeknummer (maandag = dag 1)
   =========================================================== */
function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Map front-end waarde → [from, to] (ISO strings)
 */
function resolveRange(rangeLabel, startParam) {
  const now = new Date();
  const label = String(rangeLabel || "").toLowerCase();

  let customStart = null;
  if (startParam) {
    const t = new Date(startParam);
    if (!isNaN(t.valueOf())) customStart = t;
  }

  const isToday = ["vandaag", "today"].includes(label);
  const isTomorrow = ["morgen", "tomorrow"].includes(label);
  const isWeek = ["deze week", "week"].includes(label);
  const isMonth = ["deze maand", "month"].includes(label);
  const isYear = ["dit jaar", "year"].includes(label);
  const isDate = ["specifieke datum", "date"].includes(label);
  const isAll = ["alles", "all"].includes(label);

  let from, to;
  if (isToday) {
    from = startOfDay(now);
    to = addDays(from, 1);
  } else if (isTomorrow) {
    from = addDays(startOfDay(now), 1);
    to = addDays(from, 1); 
  } else if (isWeek) {
    from = startOfWeekMonday(now);
    to = addDays(from, 7);
  } else if (isMonth) {
    from = startOfMonth(now);
    to = startOfNextMonth(now);
  } else if (isYear) {
    from = startOfYear(now);
    to = startOfNextYear(now);
  } else if (isDate) {
    const base = customStart ? startOfDay(customStart) : startOfDay(now);
    from = base;
    to = addDays(base, 1);
  } else if (isAll) {
    from = new Date(now.getFullYear() - 5, 0, 1);
    to = new Date(now.getFullYear() + 10, 0, 1);
  } else {
    from = startOfWeekMonday(now);
    to = addDays(from, 7);
  }

  return [from.toISOString(), to.toISOString()];
}

/* ===========================================================
   🔁 Compute next visit
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
   🗓️ Basis GET-routes hersteld
   =========================================================== */

/** ✅ GET /api/planning/schedule
 *  Ondersteunt filters: range, memberId, status, week, start
 */
router.get("/schedule", async (req, res) => {
  try {
    const { range = "all", memberId, status, week, start } = req.query;

    // 🕓 Bereken datumbereik
    const [fromIso, toIso] = resolveRange(range, start);

    const conditions = [];
    const params = [];

    // Datumfilter op basis van range
    if (range && range !== "all") {
      params.push(fromIso, toIso);
      conditions.push(`p.date BETWEEN $${params.length - 1} AND $${params.length}`);
    }

    // Member-filter
    if (memberId) {
      params.push(memberId);
      conditions.push(`p.member_id = $${params.length}`);
    }

    // Status-filter
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    // Week-filter
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
      JOIN contacts  ct ON c.contact_id = ct.id
      LEFT JOIN members m ON p.member_id = m.id
      ${whereClause}
      ORDER BY p.date ASC, customer ASC
    `;

    const { rows } = await pool.query(sql, params);
    res.json({ items: rows, range, appliedFilters: { memberId, status, week, range } });
  } catch (err) {
    console.error("❌ Planning schedule fetch error:", err);
    res.status(500).json({ error: "Database error while fetching schedule" });
  }
});


/* ===========================================================
   🗓️  Endpoints
   =========================================================== */
// (Alle bestaande GET, POST, PUT, DELETE routes blijven ongewijzigd...)

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

    if (!planRows.length) return res.status(404).json({ error: "Planning niet gevonden" });
    const plan = planRows[0];
    const { plan_date, city, client_status } = plan;
    if (client_status !== "Active") {
      console.warn("⛔ Klant is inactief — geen member toegewezen");
      return res.json({ warning: "Klant niet actief" });
    }

    console.log(`📍 Stad van klant: ${city}`);

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
    const loadMap = Object.fromEntries(loads.map(l => [l.member_id, parseFloat(l.total_value || 0)]));

    // 4️⃣ Bepaal stadshits
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
      const score = totalValue - (sameCityHits * 50);
      return { ...m, sameCityHits, totalValue, score };
    });

    const candidates = await Promise.all(candidatePromises);
    const filtered = candidates.filter(c => c.totalValue < 500);
    const sorted = (filtered.length ? filtered : candidates).sort((a, b) => a.score - b.score);
    const chosen = sorted[0];

    if (!chosen) {
      console.warn("⚠️ Geen geschikte member gevonden");
      return res.json({ warning: "Geen geschikte member" });
    }

    // 5️⃣ Update planning
    await pool.query(`UPDATE planning SET member_id = $1 WHERE id = $2`, [chosen.id, planningId]);
    console.log(`✅ Slim toegewezen member '${chosen.name}' aan planning ${planningId}`);
    console.log(`   ➜ Dagload: €${chosen.totalValue.toFixed(2)}, Regio-hits: ${chosen.sameCityHits}`);

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

/** 🧠 Auto-assign alle planningen van één contract (batch) */
router.post("/auto-assign/contract/:contractId", async (req, res) => {
  try {
    const { contractId } = req.params;
    console.log(`🧠 Batch auto-assign gestart voor contract ${contractId}`);

    const { rows: plannings } = await pool.query(
      `SELECT id FROM planning 
        WHERE contract_id = $1 
          AND member_id IS NULL`,
      [contractId]
    );

    if (!plannings.length) {
      console.log(`ℹ️ Geen planningen zonder member gevonden voor contract ${contractId}`);
      return res.json({ ok: true, count: 0 });
    }

    // 🔁 Gebruik LOCAL_URL als die bestaat, anders APP_URL
    const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;

    for (const p of plannings) {
      await fetch(`${baseUrl}/api/planning/auto-assign/${p.id}`, { method: "POST" });
      console.log(`👤 Auto-assign uitgevoerd voor planning ${p.id}`);
    }

    res.json({ ok: true, count: plannings.length });
    console.log(`✅ Batch auto-assign afgerond voor contract ${contractId} (${plannings.length} planningen bijgewerkt)`);
  } catch (err) {
    console.error("❌ Batch auto-assign fout:", err);
    res.status(500).json({ error: "Batch auto-assign mislukt" });
  }
});

//router.use("/dashboard/api/planning", router);

/** ✅ POST /api/planning  → maak ad-hoc planningrecord aan */
router.post("/", async (req, res) => {
  try {
    const { contractId, memberId, date, status = "Gepland", comment = null, invoiced = false } = req.body;

    if (!contractId || !date)
      return res.status(400).json({ error: "contractId en date zijn verplicht" });

    const dt = new Date(date);
    const weekNumber = getIsoWeekNumber(dt);

    const { rows } = await pool.query(
      `INSERT INTO planning 
         (id, contract_id, member_id, date, week_number, status, comment, invoiced, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       RETURNING *`,
      [uuidv4(), contractId, memberId || null, dt.toLocaleDateString('en-CA'), weekNumber, status, comment, !!invoiced]
    );

    // Niet-blokkerend: auto-assign proberen
    try {
      const baseUrl = process.env.LOCAL_URL || process.env.APP_URL;
      await fetch(`${baseUrl}/api/planning/auto-assign/${rows[0].id}`, { method: "POST" });
    } catch (e) {
      console.warn("Auto-assign call failed:", e.message);
    }

    res.status(201).json(rows[0]);
    console.log(`🆕 Ad-hoc planningrecord aangemaakt voor contract ${contractId}`);
  } catch (err) {
    console.error("Planning create error:", err);
    res.status(500).json({ error: "Failed to create planning item" });
  }
});

/** 🔁 Rebuild planningreeks vanaf front-end */
router.post("/rebuild/:contractId", async (req, res) => {
  try {
    const { contractId } = req.params;
    const { startDate } = req.body || {};

    console.log(`🔁 Rebuild gestart via front-end voor contract ${contractId}`);
    if (startDate) console.log(`📅 Nieuwe startdatum: ${startDate}`);

    // geef opties door aan helper
    const count = await rebuildSeriesForContract(contractId, {
      resetExisting: true,
      startDate,
      logPrefix: "FRONTEND rebuild – "
    });

    res.json({ ok: true, count });
    console.log(`✅ Rebuild voltooid: ${count} planningen opnieuw aangemaakt`);
  } catch (err) {
    console.error("Rebuild error:", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to rebuild planning" });
  }
});
// ...
router.post("/share", async (req, res) => {
  try {
    const { periode } = req.body;
    if (!periode) return res.status(400).json({ error: "Periode is verplicht" });

    // 📅 Bereken tijdsrange
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    switch (periode) {
      case "Voor Morgen":
        start.setDate(now.getDate() + 1);
        end.setDate(now.getDate() + 1);
        break;
      case "Deze Week":
        start.setDate(now.getDate() - now.getDay() + 1);
        end.setDate(start.getDate() + 6);
        break;
      case "Deze Maand":
        start.setDate(1);
        end.setMonth(start.getMonth() + 1);
        end.setDate(0);
        break;
    }

    // 🗓️ Planning ophalen
    const { rows: planning } = await pool.query(`
  SELECT p.*, 
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
  WHERE p.date BETWEEN $1 AND $2
    AND p.status != 'Geannuleerd'
  ORDER BY m.name, p.date ASC
`, [start.toISOString(), end.toISOString()]);

    if (!planning.length)
      return res.status(400).json({ error: "Geen planning gevonden" });

    // 🧩 Groepeer per member
    const grouped = {};
    for (const p of planning) {
      if (!grouped[p.member_id]) grouped[p.member_id] = [];
      grouped[p.member_id].push(p);
    }

    // 📸 Screenshot per member
    // 📂 Controleer of screenshots-map bestaat
    const screenshotsDir = path.join(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();

    const sent = [];

    for (const [memberId, items] of Object.entries(grouped)) {
      const member = items[0];
      const html = `
        <html>
        <head><style>
          body { font-family: Arial; padding: 20px; }
          h3 { margin-bottom: 10px; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ddd; padding: 6px; font-size: 13px; }
        </style></head>
        <body>
          <h3>Planning voor ${periode} – ${member.member_name}</h3>
          <table>
            <tr><th>Datum</th><th>Klant</th><th>Adres</th><th>Stad</th><th>Opmerking</th></tr>
            ${items.map(i => {
  const d = i.date
    ? (typeof i.date === "string"
        ? i.date.split("T")[0]
        : new Date(i.date).toISOString().split("T")[0])
    : "-";
  return `
    <tr>
      <td>${d}</td>
      <td>${i.klant}</td>
      <td>${i.address || ""} ${i.house_number || ""}</td>
      <td>${i.city}</td>
      <td>${i.comment || "-"}</td>
    </tr>`;
}).join("")}

          </table>
        </body></html>
      `;

      await page.setContent(html);
      const filePath = path.join(screenshotsDir, `planning_${member.member_name}.png`);
      await page.screenshot({ path: filePath, fullPage: true });

      // 🔹 Verstuur via WhatsApp
      const phone = member.member_phone?.replace(/\D/g, "");
      if (phone) {
        await fetch(`${process.env.APP_URL}/api/whatsapp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            message: `Hi ${member.member_name}, hierbij de planning voor ${periode}.`,
            filePath: path.resolve(filePath).replace(/\\/g, "/")
          }),
        });
        sent.push(phone);
      } else {
  console.warn(`⚠️ Geen telefoonnummer voor ${member.member_name}`);
    }
    console.log("➡️ Verstuur planning naar:", phone, "bestand:", filePath);
  }
    await browser.close();
    res.json({ ok: true, sentCount: sent.length });
  } catch (err) {
    console.error("❌ Deel planning error:", err);
    res.status(500).json({ error: "Fout bij delen planning" });
  }
});
/** ✅ PUT /api/planning/:id */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { date, memberId, status, comment, invoiced, cancel_reason } = req.body;

    const check = await pool.query("SELECT id FROM planning WHERE id = $1 LIMIT 1", [id]);
    if (!check.rows.length) return res.status(404).json({ error: "Planning niet gevonden" });

    const updates = [];
    const params = [];
    let i = 1;

    if (date) {
      const dt = new Date(date);
      updates.push(`date = $${i++}`);
      params.push(dt.toLocaleDateString("en-CA"));
      updates.push(`week_number = $${i++}`);
      params.push(getIsoWeekNumber(dt));
    }
    if (memberId) { updates.push(`member_id = $${i++}`); params.push(memberId); }
    if (status) { updates.push(`status = $${i++}`); params.push(status); }
    if (comment !== undefined) { updates.push(`comment = $${i++}`); params.push(comment); }
    if (invoiced !== undefined) { updates.push(`invoiced = $${i++}`); params.push(invoiced); }
    //if (cancel_reason !== undefined) { updates.push(`cancel_reason = $${i++}`); params.push(cancel_reason); }
    if (status === "Geannuleerd") {
  // als de status op 'Geannuleerd' gezet is, update het veld met de opgegeven reden (kan leeg zijn)
  updates.push(`cancel_reason = $${i++}`);
  params.push(cancel_reason || null);
} else if (cancel_reason && cancel_reason.trim() !== "") {
  // alleen backend-processen (zoals client → inactive) sturen een niet-lege reden mee
  updates.push(`cancel_reason = $${i++}`);
  params.push(cancel_reason.trim());
}

    if (!updates.length) return res.status(400).json({ error: "Geen velden om bij te werken" });

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
/** ✅ GET – planningrecords in periode (voor facturatie preview) */
router.get("/period-preview", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({ error: "startDate en endDate zijn verplicht" });

    const { rows } = await pool.query(
      `SELECT 
         p.id, p.date, p.status, p.invoiced,
         c.name AS client_name,
         ct.description, ct.price_inc, ct.vat_pct
       FROM planning p
       JOIN contracts ct ON p.contract_id = ct.id
       JOIN contacts c ON ct.contact_id = c.id
       WHERE p.date BETWEEN $1 AND $2
         AND p.status NOT IN ('Geannuleerd','Gepland')
         AND p.invoiced = false
         AND (ct.maandelijkse_facturatie = false OR ct.maandelijkse_facturatie IS NULL)
       ORDER BY p.date`,
      [startDate, endDate]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen planning preview:", err.message);
    res.status(500).json({ error: "Databasefout bij ophalen planning preview" });
  }
});

/** ✅ GET – planningrecords per tag (voor facturatie preview) */
router.get("/tag-preview", async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag) return res.status(400).json({ error: "Tag is verplicht" });

    const { rows } = await pool.query(
  `SELECT 
     p.id, p.date, p.status, p.invoiced,
     c.name AS client_name,
     ct.description, ct.price_inc, ct.vat_pct
   FROM planning p
   JOIN contracts ct ON p.contract_id = ct.id
   JOIN contacts c ON ct.contact_id = c.id
   WHERE $1 IN (SELECT jsonb_array_elements_text(c.tag))
     AND p.status NOT IN ('Geannuleerd','Gepland')
     AND p.invoiced = false
     AND (ct.maandelijkse_facturatie = false OR ct.maandelijkse_facturatie IS NULL)
   ORDER BY p.date`,
  [tag]
);


    res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen tag preview:", err.message);
    res.status(500).json({ error: "Databasefout bij ophalen tag preview" });
  }
});

/** 🔍 Zoek planning op naam, adres of datum */
router.get("/search", async (req, res) => {
  try {
    const { term } = req.query;
    if (!term) return res.status(400).json({ error: "term is verplicht" });

    const like = `%${term.toLowerCase()}%`;
    const { rows } = await pool.query(
      `SELECT 
         p.id, p.date, p.status,
         c.name AS client_name, c.address
       FROM planning p
       JOIN contracts ct ON p.contract_id = ct.id
       JOIN contacts c ON ct.contact_id = c.id
       WHERE (LOWER(c.name) LIKE $1 OR LOWER(c.address) LIKE $1 OR CAST(p.date AS TEXT) LIKE $1)
       ORDER BY p.date DESC
       LIMIT 25`,
      [like]
    );

    res.json(rows);
  } catch (err) {
    console.error("❌ Fout bij planning search:", err.message);
    res.status(500).json({ error: "Databasefout bij planning search" });
  }
});



export default router;
