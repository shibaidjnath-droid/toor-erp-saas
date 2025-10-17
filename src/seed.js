import { v4 as uuidv4 } from "uuid";
import mollieModule from "@mollie/api-client";
import { clients } from "./routes/cleints.js";
import { invoices } from "./routes/invoices.js";

const createMollieClient = mollieModule.default;

// Random naamgenerator
function randomName() {
  const first = ["Jan", "Sara", "Koen", "Mila", "Daan", "Lotte", "Tom", "Sofie", "Ravi", "Avi"];
  const last = ["Jansen", "Bakker", "de Vries", "Smit", "Peters", "Visser", "Bos", "Hendriks"];
  return `${first[Math.floor(Math.random() * first.length)]} ${
    last[Math.floor(Math.random() * last.length)]
  }`;
}

// Random bedrag (tussen 10–250)
function randomAmount() {
  return Math.round(Math.random() * 240 + 10);
}

// Maak dummy clients
function generateClients(count = 10) {
  for (let i = 0; i < count; i++) {
    const newClient = {
      id: uuidv4(),
      name: randomName(),
      address: `Straat ${i + 1}`,
      email: `client${i + 1}@example.com`,
      phone: `06123456${70 + i}`,
    };
    clients.push(newClient);
  }
}

// Maak dummy facturen (met Mollie-betaallink)
async function generateInvoices() {
  const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

  for (let c of contacts) {
    const amount = randomAmount();
    const invoice = {
      id: uuidv4(),
      contactId: c.id,
      customer: c.name,
      amount,
      status: "open",
    };

    try {
      const payment = await mollie.payments.create({
        amount: { value: amount.toFixed(2), currency: "EUR" },
        description: `Testfactuur voor ${c.name}`,
        redirectUrl: `${process.env.APP_URL || "http://localhost:5000"}/thanks`,
        webhookUrl: `${process.env.APP_URL || "http://localhost:5000"}/api/webhook/mollie`,
        metadata: { invoiceId: invoice.id },
      });

      invoice.paymentUrl = payment._links.checkout.href;
      invoice.mollieId = payment.id;
      invoices.push(invoice);
    } catch (err) {
      console.error("Mollie fout bij factuur:", err.message);
    }
  }
}

export async function seedData() {
  console.log("Seeding testdata...");
  generateContacts(10);
  await generateInvoices();
  console.log("✅ Testdata gegenereerd:", contacts.length, "contacten,", invoices.length, "facturen");
}
