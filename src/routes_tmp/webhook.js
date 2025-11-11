// routes/webhook.js
import express from "express";
import mollieModule from "@mollie/api-client";
import { pool } from "../db.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();
const createMollieClient = mollieModule.default;

/**
 * ✅ POST /api/webhook/mollie
 * Wordt aangeroepen door Mollie zodra de betaalstatus wijzigt.
 */
router.post("/mollie", async (req, res) => {
  const paymentId = req.body.id;
  if (!paymentId) {
    return res.status(400).send("No payment ID received");
  }

  try {
    const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
    const payment = await mollie.payments.get(paymentId);

    // metadata bevat bij aanmaak: invoiceId / clientId
    const invoiceId = payment.metadata?.invoiceId;

    if (!invoiceId) {
      console.warn(`⚠️ Geen invoiceId in metadata voor betaling ${paymentId}`);
      return res.status(200).send("No invoiceId provided");
    }

    // bepaal nieuwe status
    let newStatus = payment.status;
    switch (payment.status) {
      case "paid":
        newStatus = "betaald";
        break;
      case "expired":
        newStatus = "verlopen";
        break;
      case "canceled":
        newStatus = "geannuleerd";
        break;
      default:
        newStatus = payment.status;
    }

    // update factuur in database
    const { rows } = await pool.query(
      `UPDATE invoices
       SET status = $1
       WHERE id = $2
       RETURNING id, invoice_number, status`,
      [newStatus, invoiceId]
    );

    if (rows.length) {
      console.log(`✅ Factuur ${rows[0].invoice_number} bijgewerkt naar status: ${rows[0].status}`);
    } else {
      console.warn(`⚠️ Geen factuur gevonden voor Mollie payment ${paymentId}`);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).send("Error handling Mollie webhook");
  }
});

export default router;
