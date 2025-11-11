// routes/whatsapp.js
import express from "express";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";

const { Client, LocalAuth, MessageMedia } = pkg;

const router = express.Router();

// Client initialisatie
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./sessions" }),
  puppeteer: { headless: true, args: ["--no-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("📱 Scan deze QR om in te loggen op WhatsApp:");
  qrcode.generate(qr, { small: true });
});
client.on("ready", () => console.log("✅ WhatsApp client is klaar"));
client.on("auth_failure", (msg) => console.error("❌ Auth fout:", msg));
client.on("disconnected", () => console.warn("⚠️ WhatsApp sessie verbroken"));

client.initialize();

// --- ✅ Route: QR ophalen (handmatig te testen)
router.get("/qr", (_req, res) => {
  res.send("Kijk in je console voor QR-code");
});

// --- ✅ Route: bericht versturen
router.post("/send", async (req, res) => {
  try {
    const { phone, message, filePath } = req.body;
    if (!phone) return res.status(400).json({ error: "phone is verplicht" });

    const formatted = phone.replace(/\D/g, "") + "@c.us";
    console.log("📦 WhatsApp send request ontvangen:", {
      phone,
      filePath,
      exists: filePath ? fs.existsSync(filePath) : false,
      absolute: filePath ? path.resolve(filePath) : null
    });

    if (filePath && fs.existsSync(filePath)) {
  const normalized = path.resolve(filePath).replace(/\\/g, "/");
  console.log("📁 Media check:", normalized);

  const buffer = fs.readFileSync(normalized);
  const base64 = buffer.toString("base64");
  const media = new MessageMedia("image/png", base64, path.basename(normalized));

  // ✅ getNumberId + veilig verzenden
  const numberId = await client.getNumberId(phone);
  if (!numberId) {
    console.warn(`⚠️ ${phone} niet gevonden op WhatsApp`);
    return res.status(400).json({ error: "Nummer niet gevonden in WhatsApp" });
  }

  await client.sendMessage(numberId._serialized, media, { caption: message });
  console.log(`✅ WhatsApp bericht + afbeelding verzonden naar ${phone}`);
  return res.json({ ok: true, to: phone });
}


    // fallback: alleen tekst
    await client.sendMessage(formatted, message);
    console.log(`✅ WhatsApp tekstbericht verzonden naar ${phone}`);
    res.json({ ok: true, to: phone });
  } catch (err) {
    console.error("❌ WhatsApp send error:", err);
    res.status(500).json({ error: "Fout bij verzenden bericht" });
  }
});


export default router;
