import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

/** Weeknummer helper */
function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** 🔁 Rebuild planningreeks (12 maanden vooruit) */
export async function rebuildSeriesForContract(contractId, options = {}) {
  try {
    // 0️⃣ Opties interpreteren
    const resetExisting =
      typeof options === "boolean" ? options : (options.resetExisting ?? true);

    // 🧠 Startdatum veilig parsen (kan string of Date zijn)
    let startDate = null;
    if (options.startDate) {
      const raw = options.startDate;
      if (raw instanceof Date) {
        startDate = raw; // al een Date
      } else if (typeof raw === "string") {
        // ISO of YYYY-MM-DD
        const clean = raw.includes("T") ? raw : `${raw}T12:00:00`;
        startDate = new Date(clean);
      }
    }

    const logPrefix = options.logPrefix || "";
    console.log(`${logPrefix}🔁 Rebuild gestart voor contract ${contractId}`);

    // 1️⃣ Contract ophalen
    const { rows } = await pool.query(
      `SELECT id, frequency, next_visit, last_visit
         FROM contracts
         WHERE id = $1
         LIMIT 1`,
      [contractId]
    );

    if (!rows.length) {
      console.warn(`${logPrefix}⚠️ Contract niet gevonden`);
      return 0;
    }

    const contract = rows[0];
    const freq = contract.frequency || "Maand";

    // 2️⃣ Laatste toegewezen member_id bewaren (indien aanwezig)
    const { rows: mem } = await pool.query(
      `SELECT member_id
         FROM planning
        WHERE contract_id = $1 AND member_id IS NOT NULL
        ORDER BY date DESC
        LIMIT 1`,
      [contractId]
    );
    const memberId = mem.length ? mem[0].member_id : null;

    // 3️⃣ Oude actieve planningen verwijderen
    if (resetExisting) {
      await pool.query(
        `DELETE FROM planning
           WHERE contract_id = $1
             AND status NOT IN ('Afgerond', 'Geannuleerd')`,
        [contractId]
      );
    }

    // 4️⃣ Startdatum bepalen (altijd geldig Date-object)
    const base =
      startDate instanceof Date
        ? startDate
        : startDate
        ? new Date(startDate)
        : new Date(contract.next_visit || contract.last_visit || new Date());

    console.log(`${logPrefix}📅 Startdatum nieuwe reeks: ${base.toISOString().split("T")[0]}`);

    // 5️⃣ Nieuwe planningen genereren
    const items = [];
    let d = new Date(base);

    for (let i = 0; i < 12; i++) {
      if (i > 0) {
        switch (freq) {
          case "3 weken":
            d.setDate(d.getDate() + 21);
            break;
          case "4 weken":
            d.setDate(d.getDate() + 28);
            break;
          case "6 weken":
            d.setDate(d.getDate() + 42);
            break;
          case "8 weken":
            d.setDate(d.getDate() + 56);
            break;
          case "12 weken":
            d.setDate(d.getDate() + 84);
            break;
          case "3 keer per jaar":
            d.setMonth(d.getMonth() + 4);
            break;
          case "1 keer per jaar":
            d.setFullYear(d.getFullYear() + 1);
            break;
          default:
            d.setMonth(d.getMonth() + 1);
        }
      }

      const week = getIsoWeekNumber(d);
      items.push({
        id: uuidv4(),
        contract_id: contractId,
        member_id: memberId,
        date: d.toLocaleDateString('en-CA'),
        week_number: week,
        status: "Gepland",
        created_at: new Date(),
      });
    }

    // 6️⃣ Insert uitvoeren
    const values = items
      .map(
        (_, i) =>
          `($${i * 7 + 1},$${i * 7 + 2},$${i * 7 + 3},$${i * 7 + 4},$${i * 7 + 5},$${i * 7 + 6},$${i * 7 + 7})`
      )
      .join(",");
    const params = items.flatMap((p) => [
      p.id,
      p.contract_id,
      p.member_id,
      p.date,
      p.week_number,
      p.status,
      p.created_at,
    ]);

    await pool.query(
      `INSERT INTO planning (id, contract_id, member_id, date, week_number, status, created_at)
         VALUES ${values}`,
      params
    );

    console.log(`${logPrefix}✅ ${items.length} planningen aangemaakt (member ${memberId || "geen"})`);
    return items.length;
  } catch (err) {
    console.error(`${options.logPrefix || ""}❌ Fout in rebuildSeriesForContract:`, err);
    return 0;
  }
}




/**
 * 🧹 Annuleer alle actieve planningen + zet contract einddatum bij klant-inactivatie
 */
export async function cancelPlanningForClient(clientId, reason) {
  try {
    // ✅ Alleen twee toegestane redenen bij klant-inactivatie
    const allowedReasons = [
      "Contract stop gezet door klant",
      "Contract stop gezet door ons"
    ];

    const finalReason = allowedReasons.includes(reason)
      ? reason
      : "Contract stop gezet door klant";

    // ✅ 1. Zet contract einddatum op vandaag (alle contracts van deze klant)
 await pool.query(
  `UPDATE contracts
     SET contract_eind_datum = NOW(),
         contract_beeindigd = 'Ja'
   WHERE contact_id = $1`,
  [clientId]
);

    // ✅ 2. Annuleer alle actieve planningen
    const result = await pool.query(
      `UPDATE planning
         SET status = 'Geannuleerd',
             cancel_reason = $2,
             member_id = NULL
       WHERE contract_id IN (
         SELECT id FROM contracts WHERE contact_id = $1
       )
         AND status NOT IN ('Afgerond', 'Geannuleerd')`,
      [clientId, finalReason]
    );

    console.log(
      `🛑 ${result.rowCount} planningen geannuleerd + contract einddatum gezet voor klant ${clientId} (${finalReason})`
    );

    return result.rowCount;
  } catch (err) {
    console.error("❌ Fout bij cancelPlanningForClient:", err.message);
  }
}
