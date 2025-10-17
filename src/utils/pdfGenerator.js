import fs from "fs-extra";
import path from "path";
import puppeteer from "puppeteer";

/**
 * Genereert een PDF-factuur uit het HTML-template.
 * @param {Object} invoice - Factuurgegevens (number, date, amount, description)
 * @param {Object} client  - Klantgegevens (name, email)
 * @param {string} paymentUrl - Mollie betaal-link
 * @returns {Buffer} pdfBuffer
 */
export async function generateInvoicePDF(invoice, client, paymentUrl) {
  // 1️⃣ Pad naar het HTML-template
  const templatePath = path.join(__dirname, "../templates/invoice.html");
  let html = await fs.readFile(templatePath, "utf8");

  // 2️⃣ Vervang placeholders in het template
  const rows = `<tr><td>${invoice.description || "Diensten"}</td><td>€${invoice.amount.toFixed(2)}</td></tr>`;
  html = html
    .replace("{{invoiceNumber}}", invoice.number || "—")
    .replace("{{clientName}}", client.name)
    .replace("{{date}}", invoice.date)
    .replace("{{rows}}", rows)
    .replace("{{amount}}", invoice.amount.toFixed(2))
    .replace("{{paymentUrl}}", paymentUrl || "#");

  // 3️⃣ Start headless Chromium via Puppeteer
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  // 4️⃣ Genereer PDF
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
  });

  await browser.close();
  return pdfBuffer;
}
