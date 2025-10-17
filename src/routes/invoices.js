// routes/invoices.js
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import mollieModule from "@mollie/api-client";
import dotenv from "dotenv";

dotenv.config();
const createMollieClient = mollieModule.default;
const router = express.Router();

/** Helpers **/
function toAmountString(n) {
  const num = isNaN(parseFloat(n)) ? 0 : parseFloat(n);
  return num.toFixed(2);
}

function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const rand = uuidv4().slice(0, 6).toUpperCase();
  return `INV-${year}${month}-${rand}`;
}

/** ✅ GET – alle facturen met klantnaam **/
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.*, c.name AS client_name, c.email AS client_email
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      ORDER BY i.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("DB error (get invoices):", err);
    res.status(500).json({ error: "Database error" });
  }
});

/** ✅ GET – factuur per id **/
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name, c.email AS client_email
       FROM invoices i
       LEFT JOIN contacts c ON i.contact_id = c.id
       WHERE i.id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Invoice not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB error (get invoice):", err);
    res.status(500).json({ error: "Database error" });
  }
});

/** ✅ POST – nieuwe factuur aanmaken voor een client **/
router.post("/", async (req, res) => {
  const { clientId, amount } = req.body;
  if (!clientId || !amount)
    return res.status(400).json({ error: "clientId and amount required" });

  try {
    // 🔹 1. Controleer of klant bestaat
    const clientQuery = await pool.query("SELECT * FROM contacts WHERE id = $1", [clientId]);
    const client = clientQuery.rows[0];
    if (!client) return res.status(404).json({ error: "Client not found" });

    // 🔹 2. Maak Mollie payment
    const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
    const invoiceNumber = generateInvoiceNumber();
    const formattedAmount = toAmountString(amount);

    const payment = await mollie.payments.create({
      amount: { value: formattedAmount, currency: "EUR" },
      description: `Factuur ${invoiceNumber} – ${client.name}`,
      redirectUrl: `${process.env.APP_URL}/thanks`,
      webhookUrl: `${process.env.APP_URL}/api/webhook/mollie`,
      metadata: { invoiceNumber, clientId },
    });

    // 🔹 3. Sla factuur op in DB
    const insert = await pool.query(
      `INSERT INTO invoices (invoice_number, contact_id, customer, amount, status, mollie_id, payment_url)
       VALUES ($1,$2,$3,$4,'open',$5,$6) RETURNING *`,
      [
        invoiceNumber,
        clientId,
        client.name,
        formattedAmount,
        payment.id,
        payment._links.checkout.href,
      ]
    );
    const invoice = insert.rows[0];

    // 🔹 4. Log automatisch een e-mail
    await pool.query(
      `INSERT INTO email_log (to_contact_id, to_email, type, invoice_id, sent_at)
       VALUES ($1,$2,'invoice',$3, now())`,
      [clientId, client.email, invoice.id]
    );

    res.status(201).json(invoice);
  } catch (err) {
    console.error("Create invoice error:", err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

/** ✅ PUT – update status (bijv. betaald, geannuleerd) **/
router.put("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });

    const { rows } = await pool.query(
      "UPDATE invoices SET status=$1 WHERE id=$2 RETURNING *",
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Invoice not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("DB update error:", err);
    res.status(500).json({ error: "Database update error" });
  }
});

export default router;
