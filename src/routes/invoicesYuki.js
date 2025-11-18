// routes/invoicesYuki.js
import express from "express";
import { pool } from "../db.js";
import axios from "axios";
import dotenv from "dotenv";
import xml2js from "xml2js";
dotenv.config();

const router = express.Router();

// 🔐 Config
const YUKI_AUTH_URL = process.env.YUKI_AUTH_URL || "https://api.yukiworks.nl/ws/Sales.asmx";
const YUKI_BASE = process.env.YUKI_BASE || "https://oamkb-compleet.yukiworks.nl/ws/Sales.asmx";
const YUKI_ACCESS_KEY = process.env.YUKI_ACCESS_KEY;
const YUKI_ADMIN_ID = process.env.YUKI_ADMIN_ID;

// 🧮 BTW-type mapping (altijd 21%)
function getVATType() {
  return 1; // Altijd hoog tarief (21%)
}

/* =========================================================
   🔑 Authenticate bij Yuki (SOAP via api.yukiworks.nl)
   ========================================================= */
async function authenticateYuki() {
  try {
    const res = await axios.post(
      `${YUKI_AUTH_URL}/Authenticate`,
      `accessKey=${YUKI_ACCESS_KEY}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          SOAPAction: '"http://www.theyukicompany.com/Authenticate/Authenticate"',
          Host: "api.yukiworks.nl",
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    const xml = String(res.data);
    const sessionId =
      xml.match(/<AuthenticateResult>(.*?)<\/AuthenticateResult>/)?.[1] ||
      xml.match(/<string.*?>(.*?)<\/string>/)?.[1];

    if (!sessionId) {
      console.error("❌ Geen sessionId ontvangen van Yuki. Response:\n", xml.substring(0, 500));
      throw new Error("Geen geldig sessionId ontvangen van Yuki");
    }

    console.log("✅ Session ID ontvangen:", sessionId);
    return sessionId;
  } catch (err) {
    console.error("❌ Fout bij Authenticate Yuki:", err.message);
    throw err;
  }
}

/* =========================================================
   🧾 XML-builder voor ProcessSalesInvoices
   ========================================================= */
function buildInvoiceXML(row) {
  const vatType = getVATType(row.vat_pct);
  const date = new Date(row.date || new Date()).toISOString().split("T")[0];
  const dueDate = new Date(new Date(date).setMonth(new Date(date).getMonth() + 1))
    .toISOString()
    .split("T")[0];

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ProcessSalesInvoices xmlns="http://www.theyukicompany.com/">
      <sessionId>${row.sessionId}</sessionId>
      <administrationId>${YUKI_ADMIN_ID}</administrationId>
      <xmlDoc>
        <SalesInvoices xmlns="urn:xmlns:http://www.theyukicompany.com:salesinvoices">
          <SalesInvoice>
            <Subject>${row.description || "Factuur"}</Subject>
            <PaymentMethod>ElectronicTransfer</PaymentMethod>
            <Process>true</Process>
            <EmailToCustomer>true</EmailToCustomer>
            <Date>${date}</Date>
            <DueDate>${dueDate}</DueDate>
            <Currency>EUR</Currency>

            <Contact>
              <ContactCode />
              <FullName>${row.name || "Onbekende klant"}</FullName>
              <FirstName />
              <MiddleName />
              <LastName />
              <Gender />
              <CountryCode>${row.country || "NL"}</CountryCode>
              <City>${row.city || ""}</City>
              <Zipcode>${row.postcode || ""}</Zipcode>
              <AddressLine_1>${[row.address, row.house_number].filter(Boolean).join(" ")}</AddressLine_1>
              <AddressLine_2 />
              <EmailAddress>${row.email || ""}</EmailAddress>
              <Website />
              ${row.kvk ? `<CoCNumber>${row.kvk}</CoCNumber>` : "<CoCNumber />"}
              ${row.btw ? `<VATNumber>${row.btw}</VATNumber>` : "<VATNumber />"}
              <ContactType>${row.type_klant?.toLowerCase().includes("zak") ? "Company" : "Person"}</ContactType>
            </Contact>

            <InvoiceLines>
              <InvoiceLine>
                <Description>${row.description || "Dienst"}</Description>
                <ProductQuantity>1</ProductQuantity>
                <LineAmount>${row.price_inc || "0.00"}</LineAmount>
                <Product>
                  <Description>${row.description || "Dienst"}</Description>
                  <SalesPrice>${row.price_inc || "0.00"}</SalesPrice>
                  <VATPercentage>21.00</VATPercentage>
                  <VATIncluded>true</VATIncluded>
                  <VATType>1</VATType>
                  <GLAccountCode>8000</GLAccountCode>
                </Product>
              </InvoiceLine>
            </InvoiceLines>
          </SalesInvoice>
        </SalesInvoices>
      </xmlDoc>
    </ProcessSalesInvoices>
  </soap:Body>
</soap:Envelope>`;
}

/* =========================================================
   🪵 Logging
   ========================================================= */
async function logYukiResult(row, result) {
  try {
    await pool.query(
      `INSERT INTO yuki_invoice_log 
         (planning_id, client_name, email, amount, succeeded, message, xml_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.planning_id,
        row.name || "Onbekend",
        row.email || "",
        row.price_inc || 0,
        result.success,
        result.message || "",
        result.xml?.substring(0, 5000) || "",
      ]
    );
  } catch (err) {
    console.error("⚠️ Kon log niet opslaan:", err.message);
  }
}

/* =========================================================
   🚀 Verstuur één factuur naar Yuki
   ========================================================= */
async function sendInvoice(row) {
  const xmlBody = buildInvoiceXML(row);

  console.log("🧾 --- XML naar Yuki ---");
  console.log(xmlBody);
  console.log("🧾 --- EINDE XML ---");

  const res = await axios.post(YUKI_BASE, xmlBody, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://www.theyukicompany.com/ProcessSalesInvoices"',
      Host: "api.yukiworks.nl",
    },
    timeout: 60000,
    validateStatus: () => true,
  });

  const xml = String(res.data);
  console.log("📩 Yuki status:", res.status);
  console.log("📨 Response (eerste 1000 tekens):", xml.substring(0, 1000));

  const succeeded = xml.includes("<Succeeded>true</Succeeded>");
  const message =
    xml.match(/<Message>(.*?)<\/Message>/)?.[1] ||
    (succeeded ? "OK" : "Onbekende fout");

  return { success: succeeded, message, xml };
}

function formatResult(row, result) {
  return {
    client: row.name || row.bedrijfsnaam || "Onbekend",
    date: row.date,
    email: row.email,
    amount: row.price_inc,
    success: result.success,
    message: result.message,
  };
}

/* =========================================================
   ✅ Route 1: Enkelvoudige factuur
   ========================================================= */
router.post("/manual", async (req, res) => {
  try {
    console.log("📥 Ontvangen body:", req.body);
    const { clientId, contractId, planningId } = req.body;
    if (!clientId || !contractId || !planningId)
      return res.status(400).json({ error: "clientId, contractId en planningId zijn verplicht" });

    const { rows } = await pool.query(
      `SELECT 
         c.id AS client_id, c.name, c.email, c.phone, c.address, c.house_number, c.postcode, c.city, c.type_klant,
         ct.id AS contract_id, ct.description, ct.price_inc, ct.vat_pct, ct.maandelijkse_facturatie,
         p.id AS planning_id, p.date, p.status, p.invoiced
       FROM planning p
       JOIN contracts ct ON p.contract_id = ct.id
       JOIN contacts c ON ct.contact_id = c.id
       WHERE c.id=$1 AND ct.id=$2 AND p.id=$3
         AND p.status NOT IN ('Geannuleerd','Gepland')
         AND p.invoiced=false
         AND (ct.maandelijkse_facturatie=false OR ct.maandelijkse_facturatie IS NULL)
       LIMIT 1`,
      [clientId, contractId, planningId]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Geen geschikt record gevonden" });

    const sessionId = await authenticateYuki();
    const row = rows[0];
    row.sessionId = sessionId;
    // 🔸 Overschrijf bedrag en service vanuit de front-end
if (!isNaN(parseFloat(req.body.amount))) {
  row.price_inc = parseFloat(req.body.amount);
}
    // ✅ Type Services uit de front-end meenemen (zonder XML-wijziging)
if (Array.isArray(req.body.typeServices) && req.body.typeServices.length) {
  row.description = req.body.typeServices.join(", ");
}  
    const result = await sendInvoice(row);
    await logYukiResult(row, result);

    // ✅ Nieuwe lokale invoice opslaan
try {
  await pool.query(
    `INSERT INTO invoices 
       (planning_id, contract_id, client_name, date, amount, method, status, yuki_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      row.planning_id,
      row.contract_id,
      row.name,
      row.date,
      row.price_inc || 0,
      "Klant",
      result.success ? "Verzonden" : "Fout",
      null // ✅ Nieuw veld – voorlopig leeg, wordt later gevuld bij Yuki-sync
    ]
  );
    } catch (e) {
      console.warn("⚠️ Kon invoice record niet opslaan (manual):", e.message);
    }

    if (result.success)
      await pool.query(`UPDATE planning SET invoiced=true WHERE id=$1`, [row.planning_id]);

    return res.json({
      summary: "1 factuur verwerkt",
      results: [formatResult(row, result)],
    });
  } catch (err) {
    console.error("❌ Fout /manual:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ✅ Route 2: Bulk facturatie per Tag
   ========================================================= */
router.post("/tag", async (req, res) => {
  try {
    const { tag, selectedIds } = req.body;
    if (!tag) return res.status(400).json({ error: "Tag is verplicht" });

    // Query met optionele ID-filter
    let sql = `
       SELECT 
     c.id AS client_id, c.name, c.email, c.phone, c.address, c.house_number, c.postcode, c.city, c.type_klant, c.tag,
     ct.id AS contract_id, ct.description, ct.price_inc, ct.vat_pct, ct.maandelijkse_facturatie,
     p.id AS planning_id, p.date, p.status, p.invoiced
   FROM planning p
   JOIN contracts ct ON p.contract_id = ct.id
   JOIN contacts c ON ct.contact_id = c.id
   WHERE $1 IN (SELECT jsonb_array_elements_text(c.tag))
     AND p.status NOT IN ('Geannuleerd','Gepland')
     AND p.invoiced=false
     AND (ct.maandelijkse_facturatie=false OR ct.maandelijkse_facturatie IS NULL)
`;
const params = [tag];
if (Array.isArray(selectedIds) && selectedIds.length) {
  sql += ` AND p.id = ANY($2::uuid[])`;
  params.push(selectedIds);
}

    const { rows } = await pool.query(sql, params);
    if (!rows.length)
      return res.status(404).json({ error: "Geen planningen gevonden" });

    const sessionId = await authenticateYuki();
    const results = [];

    for (const row of rows) {
      try {
        row.sessionId = sessionId;
        const result = await sendInvoice(row);
        await logYukiResult(row, result);

       try {
  await pool.query(
    `INSERT INTO invoices 
       (planning_id, contract_id, client_name, date, amount, method, status, yuki_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      row.planning_id,
      row.contract_id,
      row.name,
      row.date,
      row.price_inc || 0,
      "Tag",
      result.success ? "Verzonden" : "Fout",
      null // ✅ nieuw veld – voorlopig leeg tot Yuki-sync
    ]
  );
        } catch (e) {
          console.warn("⚠️ Kon invoice record niet opslaan (tag):", e.message);
        }

        results.push(formatResult(row, result));
        if (result.success)
          await pool.query(`UPDATE planning SET invoiced=true WHERE id=$1`, [row.planning_id]);
      } catch (err) {
        results.push({ client: row.name, success: false, message: err.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    return res.json({
      summary: `${results.length} facturen verwerkt, ${succeeded} succesvol`,
      results,
    });
  } catch (err) {
    console.error("❌ Fout /tag:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   ✅ Route 3: Bulk facturatie per Periode
   ========================================================= */
router.post("/period", async (req, res) => {
  try {
    const { startDate, endDate, selectedIds } = req.body;
    if (!startDate || !endDate)
      return res.status(400).json({ error: "startDate en endDate zijn verplicht" });

    let sql = `
      SELECT 
        c.id AS client_id, c.name, c.email, c.phone, c.address, c.house_number, c.postcode, c.city, c.type_klant,
        ct.id AS contract_id, ct.description, ct.price_inc, ct.vat_pct, ct.maandelijkse_facturatie,
        p.id AS planning_id, p.date, p.status, p.invoiced
      FROM planning p
      JOIN contracts ct ON p.contract_id = ct.id
      JOIN contacts c ON ct.contact_id = c.id
      WHERE p.date BETWEEN $1 AND $2
        AND p.status NOT IN ('Geannuleerd','Gepland')
        AND p.invoiced = false
        AND (ct.maandelijkse_facturatie = false OR ct.maandelijkse_facturatie IS NULL)
    `;
    const params = [startDate, endDate];
    if (Array.isArray(selectedIds) && selectedIds.length) {
      sql += ` AND p.id = ANY($3::uuid[])`;
      params.push(selectedIds);
    }
    sql += ` ORDER BY p.date`;

    const { rows } = await pool.query(sql, params);
    if (!rows.length)
      return res.status(404).json({ error: "Geen planningen in deze periode" });

    const sessionId = await authenticateYuki();
    const results = [];

    for (const row of rows) {
      try {
        row.sessionId = sessionId;
        const result = await sendInvoice(row);
        await logYukiResult(row, result);

       try {
  await pool.query(
    `INSERT INTO invoices 
       (planning_id, contract_id, client_name, date, amount, method, status, yuki_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      row.planning_id,
      row.contract_id,
      row.name,
      row.date,
      row.price_inc || 0,
      "Periode",
      result.success ? "Verzonden" : "Fout",
      null // ✅ nieuw veld – voorlopig leeg, later gevuld bij Yuki-sync
    ]
  );
        } catch (e) {
          console.warn("⚠️ Kon invoice record niet opslaan (periode):", e.message);
        }

        results.push(formatResult(row, result));
        if (result.success)
          await pool.query(`UPDATE planning SET invoiced = true WHERE id = $1`, [row.planning_id]);
      } catch (err) {
        results.push({ client: row.name, success: false, message: err.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    return res.json({
      summary: `${results.length} facturen verwerkt, ${succeeded} succesvol`,
      results,
    });
  } catch (err) {
    console.error("❌ Fout /period:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// ✅ Route 4: Maandelijkse facturatie (dagelijkse batch)
//    - pakt ALLE contracts waar maandelijkse_facturatie=true
//    - en invoice_day == vandaag (1..31)
// =========================================================
router.post("/monthly", async (_req, res) => {
  try {
    const today = new Date();
    const yyyy_mm_dd = today.toISOString().split("T")[0];
    const day = today.getDate(); // 1..31

    // Contract + Contact info (zonder planning)
    const { rows } = await pool.query(`
      SELECT 
        c.id           AS client_id,
        c.name         AS name,
        c.email        AS email,
        c.phone        AS phone,
        c.address      AS address,
        c.house_number AS house_number,
        c.postcode     AS postcode,
        c.city         AS city,
        c.type_klant   AS type_klant,
        ct.id          AS contract_id,
        ct.description AS description,
        ct.price_inc   AS price_inc,
        ct.vat_pct     AS vat_pct,
        ct.maandelijkse_facturatie,
        ct.invoice_day
      FROM contracts ct
      JOIN contacts  c ON ct.contact_id = c.id
      WHERE ct.maandelijkse_facturatie = true
        AND ct.invoice_day = $1
    `, [day]);

    if (!rows.length) {
      return res.json({ summary: "Geen maandcontracten voor vandaag", results: [] });
    }

    const sessionId = await authenticateYuki();
    const results = [];

    for (const row of rows) {
      try {
        // vul ontbrekende velden zoals date voor de XML + call
        row.sessionId = sessionId;
        row.date = yyyy_mm_dd;

        const result = await sendInvoice(row);

        // Log naar yuki_invoice_log (planning_id = NULL ok)
        await logYukiResult({ ...row, planning_id: null }, result);

        // Lokale invoices-tabel (method = Maandelijks)
        try {
  await pool.query(
    `INSERT INTO invoices
       (planning_id, contract_id, client_name, date, amount, method, status, yuki_status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())`,
    [
      null,
      row.contract_id,
      row.name,
      row.date,
      row.price_inc || 0,
      "Maandelijks",
      result.success ? "Verzonden" : "Fout",
      null // ✅ nieuw veld – voorlopig leeg tot Yuki-status-sync
    ]
  );
        } catch (e) {
          console.warn("⚠️ Kon invoice record niet opslaan (maandelijks):", e.message);
        }

        results.push({
          client: row.name,
          date: row.date,
          email: row.email,
          amount: row.price_inc,
          success: result.success,
          message: result.message,
        });
      } catch (err) {
        results.push({ client: row.name, success: false, message: err.message });
      }
    }

    const ok = results.filter(r => r.success).length;
    return res.json({
      summary: `${results.length} maandfacturen verwerkt, ${ok} succesvol`,
      results,
    });
  } catch (err) {
    console.error("❌ Fout /monthly:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 🔁 Route 5: Dagelijkse Yuki-status-sync
// =========================================================
router.post("/sync-status", async (req, res) => {
  try {
    const sessionId = await authenticateYuki();

    // 1️⃣ Haal facturen op van de laatste 30 dagen
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const startDate = start.toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const xmlReq = `
       <GetSalesInvoices xmlns="urn:xmlns:http://www.theyukicompany.com:salesinvoices">
        <sessionId>${sessionId}</sessionId>
        <administrationId>${process.env.YUKI_ADMIN_ID}</administrationId>
        <startDate>${startDate}</startDate>
        <endDate>${endDate}</endDate>
      </GetSalesInvoices>`;

    const yukiResp = await callYukiSOAP(xmlReq, "GetSalesInvoices");
    const parsed = parseYukiInvoices(yukiResp); // 👇 helper hieronder

    let updated = 0;
    for (const inv of parsed) {
      const { id, status } = inv;
      if (!id || !status) continue;
      const q = await pool.query(
        `UPDATE invoices SET yuki_status=$1 WHERE id::text LIKE $2 OR contract_id::text LIKE $2 RETURNING id`,
        [status, `%${id}%`]
      );
      if (q.rowCount) updated += q.rowCount;
    }

    res.json({ summary: `${updated} lokale facturen bijgewerkt`, updated });
  } catch (err) {
    console.error("❌ Fout /sync-status:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// 🧩 Helper: SOAP-aanroep + XML-parser
// ---------------------------------------------------------


async function callYukiSOAP(xmlBody, method) {
  console.log("🧾 SOAP request:", xmlBody);
  const { data } = await axios.post(
  process.env.YUKI_INVOICE_URL || process.env.YUKI_BASE,
  xmlBody,
  {
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: method },
  });
   console.log("🧾 SOAP response:", data);
  return data;
}


function parseYukiInvoices(xmlString) {
  const result = [];
  try {
    const parsed = xml2js.parseStringSync
      ? xml2js.parseStringSync(xmlString)
      : (() => {
          let r;
          xml2js.parseString(xmlString, { explicitArray: false }, (e, res) => (r = res));
          return r;
        })();

    const list =
      parsed?.Envelope?.Body?.GetSalesInvoicesResponse?.GetSalesInvoicesResult?.SalesInvoices
        ?.SalesInvoice || [];

    for (const i of list) {
      result.push({
        id: i?.InvoiceNumber || i?.Id,
        status: i?.Status || "Onbekend",
      });
    }
  } catch (e) {
    console.warn("⚠️ Fout bij XML-parse:", e.message);
  }
  return result;
}
// =========================================================
// 🔁 Route: Dagelijkse Yuki-status-sync (REST API)
// =========================================================
router.post("/sync-status", async (_req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const startDate = since.toISOString().split("T")[0];

    // 1️⃣ Ophalen van Yuki REST API
    const url = `${process.env.YUKI_API_URL}/SalesInvoices?administrationId=${process.env.YUKI_ADMIN_ID}&createdAfter=${startDate}`;
    const { data } = await axios.get(url, {
      headers: {
        "Authorization": `Bearer ${process.env.YUKI_ACCESS_KEY}`,
        "Accept": "application/json",
      },
    });

    if (!Array.isArray(data)) {
      console.warn("⚠️ Geen lijst ontvangen van Yuki:", data);
      return res.json({ summary: "Geen facturen ontvangen van Yuki" });
    }

    // 2️⃣ Updaten lokale database
    let updated = 0;
    for (const inv of data) {
      const status = inv.Status || inv.status || null;
      const invoiceNumber = inv.InvoiceNumber?.toString() || inv.Id?.toString();
      if (!invoiceNumber || !status) continue;

      const q = await pool.query(
        `UPDATE invoices
           SET yuki_status=$1
         WHERE client_name ILIKE $2
            OR contract_id::text LIKE $3
            OR id::text LIKE $3`,
        [status, `%${inv.ContactName || ""}%`, `%${invoiceNumber}%`]
      );
      updated += q.rowCount;
    }

    res.json({ summary: `${updated} facturen bijgewerkt`, updated });
  } catch (err) {
    console.error("❌ Fout /sync-status (REST):", err.message);
    res.status(500).json({ error: err.message });
  }
});


export default router;
