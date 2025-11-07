// routes/invoicesYuki.js
import express from "express";
import { pool } from "../db.js";
import axios from "axios";

const router = express.Router();

// 🔐 Config
const YUKI_BASE = "https://oamkb-compleet.yukiworks.nl/ws/Sales.asmx";
const YUKI_ACCESS_KEY = "f954f4dc-00dc-443d-aa3a-991de5118fab";
const YUKI_ADMIN_ID = "72314c09-dbac-4b0d-9b21-b49498553b4a";

// 🧮 BTW-type mapping
function getVATType(vatPct) {
  const pct = parseFloat(vatPct);
  if (pct >= 20) return 1;
  if (pct >= 8 && pct < 10) return 2;
  return 3;
}

// ✅ Authenticate bij Yuki
async function authenticateYuki() {
  const res = await axios.post(
    `${YUKI_BASE}/Authenticate`,
    `accessKey=${YUKI_ACCESS_KEY}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const sessionId = res.data.match(/<string.*?>(.*?)<\/string>/)?.[1];
  if (!sessionId) throw new Error("Geen sessionID ontvangen van Yuki");
  return sessionId;
}

// ✅ XML-builder (universeel, particulier + zakelijk)
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
              <FullName>${row.bedrijfsnaam || row.name}</FullName>
              <AddressLine_1>${row.address || ""} ${row.house_number || ""}, ${row.postcode || ""} ${row.city || ""}</AddressLine_1>
              <EmailAddress>${row.email || ""}</EmailAddress>
              <PhoneHome>${row.phone || ""}</PhoneHome>
              <DefaultSendingMethod>Email</DefaultSendingMethod>
            </Contact>
            <InvoiceLines>
              <InvoiceLine>
                <Description>${row.description || "Dienst"}</Description>
                <ProductQuantity>1</ProductQuantity>
                <LineAmount>${row.price_inc || "0.00"}</LineAmount>
                <Product>
                  <Description>${row.description || "Dienst"}</Description>
                  <SalesPrice>${row.price_inc || "0.00"}</SalesPrice>
                  <VATPercentage>${row.vat_pct || "21.00"}</VATPercentage>
                  <VATType>${vatType}</VATType>
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


// ✅ Logging in database
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

// ✅ Verstuur één factuur
async function sendInvoice(row) {
  const xmlBody = buildInvoiceXML(row);
  console.log("📦 XML die naar Yuki wordt gestuurd:\n", xmlBody);
  const res = await axios.post(YUKI_BASE, xmlBody, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://www.theyukicompany.com/ProcessSalesInvoices"',
    },
  });

  const xml = res.data;
  const success = xml.includes("<TotalSucceeded>1</TotalSucceeded>");
  const message = xml.match(/<Message>(.*?)<\/Message>/)?.[1] || (success ? "OK" : "Onbekende fout");

  return { success, message, xml };
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

/** ✅ Route 1: Enkelvoudige factuur */
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
    console.log("📊 Query resultaat:", rows);
    if (!rows.length)
      return res.status(404).json({ error: "Geen geschikt record gevonden" });

    const sessionId = await authenticateYuki();
    const row = rows[0];
    row.sessionId = sessionId;

    const result = await sendInvoice(row);
    await logYukiResult(row, result);

    if (result.success)
      await pool.query(`UPDATE planning SET invoiced=true WHERE id=$1`, [row.planning_id]);

    return res.json({
      summary: "1 factuur verwerkt",
      results: [formatResult(row, result)],
    });
  } catch (err) {
    console.error("❌ Fout:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** ✅ Route 2: Bulk facturatie per Tag */
router.post("/tag", async (req, res) => {
  try {
    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: "Tag is verplicht" });

    const { rows } = await pool.query(
      `SELECT 
         c.id AS client_id, c.name, c.email, c.phone, c.address, c.house_number, c.postcode, c.city, c.type_klant, c.tag,
         ct.id AS contract_id, ct.description, ct.price_inc, ct.vat_pct, ct.maandelijkse_facturatie,
         p.id AS planning_id, p.date, p.status, p.invoiced
       FROM planning p
       JOIN contracts ct ON p.contract_id = ct.id
       JOIN contacts c ON ct.contact_id = c.id
       WHERE c.tag=$1
         AND p.status NOT IN ('Geannuleerd','Gepland')
         AND p.invoiced=false
         AND (ct.maandelijkse_facturatie=false OR ct.maandelijkse_facturatie IS NULL)`,
      [tag]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Geen planningen gevonden" });

    const sessionId = await authenticateYuki();
    const results = [];

    for (const row of rows) {
      try {
        row.sessionId = sessionId;
        const result = await sendInvoice(row);
        await logYukiResult(row, result);
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
    console.error("❌ Fout bij bulk/tag:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** ✅ Route 3: Bulk facturatie per Periode */
router.post("/period", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate)
      return res.status(400).json({ error: "startDate en endDate zijn verplicht" });

    const { rows } = await pool.query(
      `SELECT 
         c.id AS client_id, c.name, c.email, c.phone, c.address, c.house_number, c.postcode, c.city, c.type_klant,
         ct.id AS contract_id, ct.description, ct.price_inc, ct.vat_pct, ct.maandelijkse_facturatie,
         p.id AS planning_id, p.date, p.status, p.invoiced
       FROM planning p
       JOIN contracts ct ON p.contract_id = ct.id
       JOIN contacts c ON ct.contact_id = c.id
       WHERE p.date BETWEEN $1 AND $2
         AND p.status NOT IN ('Geannuleerd','Gepland')
         AND p.invoiced=false
         AND (ct.maandelijkse_facturatie=false OR ct.maandelijkse_facturatie IS NULL)
       ORDER BY p.date`,
      [startDate, endDate]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Geen planningen in deze periode" });

    const sessionId = await authenticateYuki();
    const results = [];

    for (const row of rows) {
      try {
        row.sessionId = sessionId;
        const result = await sendInvoice(row);
        await logYukiResult(row, result);
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
    console.error("❌ Fout bij bulk/period:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
