// routes/invoicesYuki.js
import express from "express";
import { pool } from "../db.js";
import soap from "soap";
import { XMLBuilder } from "fast-xml-parser";

const router = express.Router();

// 🔐 Config
const YUKI_WSDL = "https://api.yukiworks.nl/ws/Sales.asmx?wsdl";
const YUKI_ACCESS_KEY = "f954f4dc-00dc-443d-aa3a-991de5118fab";
const YUKI_ADMIN_ID = process.env.YUKI_ADMIN_ID || "VUL_HIER_ADMIN_ID_IN";

/** ✅ Helper: login bij Yuki */
async function authenticateYuki() {
  const client = await soap.createClientAsync(YUKI_WSDL);
  const [result] = await client.AuthenticateAsync({ accessKey: YUKI_ACCESS_KEY });
  const sessionID = result.AuthenticateResult;
  if (!sessionID) throw new Error("Geen sessionID ontvangen van Yuki");
  return { client, sessionID };
}

/** ✅ Helper: bouw XML voor 1 factuur */
function buildInvoiceXML(client, contract, planning) {
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
 const xml = builder.build({
  ArrayOfSalesInvoice: {
    "@_xmlns": "urn:xmlns:http://www.theyukicompany.com:salesinvoices",
    SalesInvoice: {
      Subject: `Factuur ${contract.type_service?.join(", ") || "Dienst"}`,
      PaymentMethod: "ElectronicTransfer",
      Process: "true",
      EmailToCustomer: "true",
      Date: new Date(planning.date).toISOString().split("T")[0],
      DueDate: new Date(
        new Date(planning.date).setDate(new Date(planning.date).getDate() + 30)
      )
        .toISOString()
        .split("T")[0],
      Currency: "EUR",
      Customer: {
  FullName:
    client.type_klant === "Zakelijk"
      ? client.bedrijfsnaam
      : client.name,
  AddressLine_1: `${client.address} ${client.house_number || ""}`.trim(),
  Zipcode: client.postcode || "",
  City: client.city || "",
  CountryCode: "NL",
  EmailAddress: client.email,
  PhoneNumber: client.phone || "",
  VATNumber: client.btw || "",
  CoCNumber: client.kvk || "",
  CustomerType:
    client.type_klant === "Zakelijk" ? "Organisation" : "Person",
},
      InvoiceLines: {
        InvoiceLine: {
          Description:
            contract.description ||
            contract.type_service?.join(", ") ||
            "Dienstverlening",
          ProductQuantity: "1",
          LineAmount: contract.price_inc || "0.00",
          VATPercentage: contract.vat_pct || "21",
          VATIncluded: "true",
          GLAccountCode: "8400",
        },
      },
    },
  },
});


  return xml;
}

/** ✅ Core-functie: stuur naar Yuki */
async function sendInvoiceToYuki(clientId, contractId, planningId) {
  // 1️⃣ Data ophalen
  const { rows: data } = await pool.query(
    `SELECT 
       ct.id AS contract_id, ct.type_service, ct.description, ct.price_inc, ct.vat_pct,
       p.id AS planning_id, p.date, p.status,
       c.id AS client_id, c.name, c.bedrijfsnaam, c.email, c.phone,
       c.address, c.house_number, c.postcode, c.city,
       c.type_klant, c.btw, c.kvk
     FROM planning p
     JOIN contracts ct ON p.contract_id = ct.id
     JOIN contacts c ON ct.contact_id = c.id
     WHERE c.id = $1 AND ct.id = $2 AND p.id = $3
     LIMIT 1`,
    [clientId, contractId, planningId]
  );
  if (!data.length) throw new Error("Geen data gevonden voor Yuki-factuur");

  const row = data[0];

  // 2️⃣ Login bij Yuki
  const { client: yuki, sessionID } = await authenticateYuki();

  // 3️⃣ XML opbouwen
  const xmlDoc = buildInvoiceXML(row, row, row);
  console.log("🧾 XML naar Yuki:\n", xmlDoc);

  // 4️⃣ Call ProcessSalesInvoices
  const [result] = await yuki.ProcessSalesInvoicesAsync({
    sessionID,
    administrationID: YUKI_ADMIN_ID,
    xmlDoc,
  });

  const xmlResponse = result.ProcessSalesInvoicesResult;

  // 5️⃣ Basis logging / parsing (simpel check)
  const success = xmlResponse.includes("<Succeeded>true</Succeeded>");
  const message = xmlResponse.match(/<Message>(.*?)<\/Message>/)?.[1] || "";

  if (!success) throw new Error(`Yuki-fout: ${message}`);

  // 6️⃣ Yuki factuurnummer uitlezen
  const invoiceNr =
    xmlResponse.match(/<SalesInvoiceNumber>(.*?)<\/SalesInvoiceNumber>/)?.[1] ||
    null;

  // 7️⃣ Opslaan in DB
  await pool.query(
    `INSERT INTO invoices (contact_id, customer, amount, status, created_at, yuki_number)
     VALUES ($1,$2,$3,$4,now(),$5)
     RETURNING id`,
    [row.client_id, row.name, row.price_inc, "verzonden", invoiceNr]
  );

  await pool.query(`UPDATE planning SET invoiced = true WHERE id = $1`, [
    row.planning_id,
  ]);

  console.log(`✅ Yuki factuur aangemaakt: ${invoiceNr}`);
  return { invoiceNr, message };
}

/** ✅ Route: test één factuur */
router.post("/manual", async (req, res) => {
  try {
    const { clientId, contractId, planningId } = req.body;
    if (!clientId || !contractId || !planningId)
      return res.status(400).json({ error: "clientId, contractId, planningId vereist" });

    const result = await sendInvoiceToYuki(clientId, contractId, planningId);
    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Yuki facturatie fout:", err.message);
    res.status(500).json({ error: err.message });
  }
});
router.get("/ping", async (_req, res) => {
  try {
    const { client, sessionID } = await authenticateYuki();
    console.log("✅ Verbonden met Yuki, sessionID:", sessionID);
    res.json({ ok: true, sessionID: sessionID?.slice(0, 10) + "..." });
  } catch (err) {
    console.error("❌ Ping fout:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});


export default router;
