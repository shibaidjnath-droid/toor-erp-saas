// planningHelpers.js — Slimme Planning v2
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";

/* ===========================================================
   🕒 NL DATUM HELPERS (GEEN UTC, GEEN SHIFTING)
   =========================================================== */

/** Converteer ISO → NL formaat dd-mm-yyyy (UI) */
export function isoToNL(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Converteer NL dd-mm-yyyy → ISO yyyy-mm-dd */
export function nlToISO(nl) {
  if (!nl) return null;
  const [dd, mm, yyyy] = nl.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

/** Maak een pure NL-datum zonder tijdzone effect */
export function nlDate(y, m, d) {
  return new Date(y, m - 1, d, 12, 0, 0); // 12:00 voorkomt TZ-shift
}

/** Normaliseer JS Date naar een pure datum (geen tijd, geen UTC-shift) */
export function normalize(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

/* ===========================================================
   📅 WEEK HELPERS (NL: maandag t/m vrijdag)
   =========================================================== */

/** Haal maandag van de week */
export function getMonday(date) {
  const d = normalize(date);
  const day = d.getDay(); // 0 = zondag, 1 = maandag
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 12);
}

/** Haal vrijdag van dezelfde week */
export function getFriday(date) {
  const mon = getMonday(date);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4, 12);
}

/* ===========================================================
   🚫 WEEKEND CORRECTIE
   =========================================================== */
export function avoidWeekend(date) {
  const d = normalize(date);
  const day = d.getDay();

  // Zondag → maandag
  if (day === 0) {
    d.setDate(d.getDate() + 1);
  }
  // Zaterdag → maandag
  if (day === 6) {
    d.setDate(d.getDate() + 2);
  }
  return normalize(d);
}

/* ===========================================================
   🔄 MARGE CHECKER (+/- 3 DAGEN)
   =========================================================== */
export function withinMargin(dateA, dateB, days = 3) {
  const a = normalize(dateA).getTime();
  const b = normalize(dateB).getTime();
  const diff = Math.abs(a - b) / 86400000;
  return diff <= days;
}

/* ===========================================================
   ➕ FREQUENTIE HULP: next visit berekenen
   =========================================================== */
export function addFrequency(baseDate, freq) {
  const d = normalize(baseDate);
  switch (freq) {
    case "3 weken":   d.setDate(d.getDate() + 21); break;
    case "4 weken":   d.setDate(d.getDate() + 28); break;
    case "6 weken":   d.setDate(d.getDate() + 42); break;
    case "8 weken":   d.setDate(d.getDate() + 56); break;
    case "12 weken":  d.setDate(d.getDate() + 84); break;
    case "3 keer per jaar": d.setMonth(d.getMonth() + 4); break;
    case "1 keer per jaar": d.setFullYear(d.getFullYear() + 1); break;
    case "Maand":
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return avoidWeekend(d);
}

/* ===========================================================
   🧮 ISO WEEKNUMMER (BLIJFT ZOALS HET WAS)
   =========================================================== */
export function getIsoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
/* ===========================================================
   🤖 SLIMME FIRST VISIT LOGICA (NIEUWE KLANT / HISTORISCH VISIT)
   =========================================================== */

/**
 * Bepaal de eerste plandatum op basis van:
 *  - last_visit (kan verleden/toekomst zijn)
 *  - vandaag (NL)
 *  - frequentie
 *  - marge van +/- 3 dagen
 *  - slimme weekplanning (ma–vr)
 *  - fallback naar volgende week
 */
export function determineFirstVisit(lastVisitISO, freq) {
  const today = normalize(new Date()); // NL today, 12:00
  let lastVisit = lastVisitISO ? normalize(new Date(lastVisitISO)) : null;

  // ⚠️ Geen last_visit? (extreem zeldzaam)
  // Dan starten we vandaag (of morgen als vandaag weekend is)
  if (!lastVisit) {
    return avoidWeekend(today);
  }

  // 1️⃣ Bepaal theoretical = last_visit + freq
  let theoretical = addFrequency(lastVisit, freq);

  // 2️⃣ CASE A — last_visit in toekomst → neem exact die datum
  if (lastVisit > today) {
    return avoidWeekend(lastVisit);
  }

  // 3️⃣ CASE B — theoretical is in toekomst (direct na freq)
  if (theoretical >= today) {
    // kleine marge: als het binnen -1 / +3 dagen ligt → plan vandaag
    if (withinMargin(theoretical, today, 3)) {
      return avoidWeekend(today);
    }
    return avoidWeekend(theoretical);
  }

  // 4️⃣ CASE C — theoretical in verleden → SLIM PLANNEN
  //
  // We proberen eerst:
  //   1. marge check: kan hij vandaag/morgen?
  //   2. ergens deze week (ma–vr)
  //   3. anders volgende week (ma–vr)

  // 4A — binnen marge?
  if (withinMargin(theoretical, today, 3)) {
    return avoidWeekend(today);
  }

  // 4B — plan in huidige week (ma–vr)
  const mon = getMonday(today);
  const fri = getFriday(today);

  if (today <= fri) {
    // plan ergens tussen today en friday
    const candidate = avoidWeekend(today);
    if (candidate <= fri) return candidate;
  }

  // anders, kies maandag van volgende week
  const nextMonday = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7, 12);

  return avoidWeekend(nextMonday);
}
/* ===========================================================
   ➕ computeNextVisit v2 (volgende bezoekdatum)
   =========================================================== */
export function computeNextVisit(baseDate, freq) {
  return addFrequency(baseDate, freq); // weekendcorrectie zit al in addFrequency()
}

/* ===========================================================
   🔁 Maak volledige reeks van 12 bezoeken
   =========================================================== */

/**
 * Genereer 12 bezoeken vanaf firstVisit:
 *  - elke volgende datum is base + freq
 *  - weekendcorrectie
 *  - weeknummers correct
 *  - ISO opslaan (yyyy-mm-dd)
 */
export function generateVisitSeries(contractId, memberId, firstVisit, freq) {
  const items = [];

  let current = normalize(firstVisit);

  for (let i = 0; i < 12; i++) {
    const visit = i === 0 ? current : computeNextVisit(current, freq);
    current = visit;

    // Weeknummer bepalen (ISO)
    const week = getIsoWeekNumber(current);

    // ISO string (uur op 12:00 om timezone shifts te voorkomen)
    const iso = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
      12, 0, 0
    ).toISOString();

    items.push({
      id: uuidv4(),
      contract_id: contractId,
      member_id: memberId || null,
      date: iso,
      week_number: week,
      status: "Gepland",
      created_at: new Date()
    });
  }

  return items;
}
/* ===========================================================
   🔁 COMPLETE REBUILD (SLIMME PLANNING V2)
   =========================================================== */

export async function rebuildSeriesForContract(contractId, options = {}) {
  try {
    const resetExisting =
      typeof options === "boolean" ? options : (options.resetExisting ?? true);

    const logPrefix = options.logPrefix || "";
    console.log(`${logPrefix}🔁 Slimme Rebuild gestart voor contract ${contractId}`);

    /* -------------------------------------------------------
       1️⃣ Contract ophalen (frequentie, last_visit, next_visit)
       ------------------------------------------------------- */
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

    /* -------------------------------------------------------
       2️⃣ Laatste toegewezen member bewaren
       ------------------------------------------------------- */
    const { rows: mem } = await pool.query(
      `SELECT member_id
         FROM planning
        WHERE contract_id = $1
          AND member_id IS NOT NULL
        ORDER BY date DESC
        LIMIT 1`,
      [contractId]
    );

    const memberId = mem.length ? mem[0].member_id : null;

    /* -------------------------------------------------------
       3️⃣ Oude toekomstige planningen verwijderen
       ------------------------------------------------------- */
    if (resetExisting) {
      await pool.query(
        `DELETE FROM planning
           WHERE contract_id = $1
             AND status NOT IN ('Afgerond', 'Geannuleerd')`,
        [contractId]
      );
    }

    /* -------------------------------------------------------
       4️⃣ FIRST VISIT bepalen
       ------------------------------------------------------- */

    // voorkeursbron van startDate (indien gebruiker zelf iets opgeeft)
    let manualStart = null;

    if (options.startDate) {
      // NL dd-mm-yyyy → ISO
      if (typeof options.startDate === "string" && options.startDate.includes("-")) {
        const iso = options.startDate.includes("-") && options.startDate.split("-")[0].length === 2
          ? nlToISO(options.startDate)
          : options.startDate;

        manualStart = normalize(new Date(iso));
      }
    }

    // bron voor slimme planning:
    const lastVisit = contract.last_visit ? normalize(new Date(contract.last_visit)) : null;

    let firstVisit;

    if (manualStart) {
      firstVisit = avoidWeekend(manualStart);
      console.log(`${logPrefix}📌 Handmatige start gebruikt:`, isoToNL(firstVisit.toISOString()));
    } else {
      firstVisit = determineFirstVisit(
        lastVisit ? lastVisit.toISOString().split("T")[0] : null,
        freq
      );
      console.log(`${logPrefix}🤖 Slimme firstVisit =`, isoToNL(firstVisit.toISOString()));
    }

    /* -------------------------------------------------------
       5️⃣ 12-maanden series genereren
       ------------------------------------------------------- */
    const items = generateVisitSeries(contractId, memberId, firstVisit, freq);

    /* -------------------------------------------------------
       6️⃣ Bulk INSERT voorbereiden
       ------------------------------------------------------- */
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
      p.created_at
    ]);

    /* -------------------------------------------------------
       7️⃣ Insert uitvoeren
       ------------------------------------------------------- */
    await pool.query(
      `INSERT INTO planning
         (id, contract_id, member_id, date, week_number, status, created_at)
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
/* ===========================================================
   ❌ KLANT INACTIEF → ANNULEREN VAN PLANNING
   =========================================================== */

export async function cancelPlanningForClient(clientId, reason) {
  try {
    // Alleen toegestane redenen bij klant-inactivatie
    const allowedReasons = [
      "Contract stop gezet door klant",
      "Contract stop gezet door ons"
    ];

    const finalReason = allowedReasons.includes(reason)
      ? reason
      : "Contract stop gezet door klant";

    // 1️⃣ Contract einddatum zetten
    await pool.query(
      `UPDATE contracts
         SET contract_eind_datum = NOW(),
             contract_beeindigd = 'Ja'
       WHERE contact_id = $1`,
      [clientId]
    );

    // 2️⃣ Alle actieve planningen annuleren
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


