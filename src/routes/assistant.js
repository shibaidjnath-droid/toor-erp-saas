// routes/assistant.js
import express from "express";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { pool } from "../db.js";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------
// 1. Simple relevance check
// ---------------------------
function isRelevant(question) {
  const keywords = [
    "klant", "contract", "planning", "factuur", "facturatie",
    "member", "medewerker", "offerte", "lead", "rol",
    "type service", "frequentie", "adres", "kvk", "btw",
    "planning genereren", "auto assign", "erfp", "toor"
  ];

  return keywords.some(k => question.toLowerCase().includes(k));
}

// ---------------------------
// 2. Knowledge Base loader
// ---------------------------
function loadKnowledgeBase() {
  const kbPath = path.join(process.cwd(), "assistant", "knowledge");
  if (!fs.existsSync(kbPath)) return "";

  const files = fs.readdirSync(kbPath);
  let content = "";

  for (const file of files) {
    if (file.endsWith(".md")) {
      const full = fs.readFileSync(path.join(kbPath, file), "utf8");
      content += `\n\n### FILE: ${file}\n${full}`;
    }
  }
  return content;
}

// ---------------------------
// 3. Try database lookups
// ---------------------------
async function tryDatabase(question) {
  const q = question.toLowerCase();
  let results = [];

  // Klanten
  if (q.includes("klant") || q.includes("customer")) {
    const { rows } = await pool.query("SELECT * FROM contacts LIMIT 50");
    results.push({ type: "clients", data: rows });
  }

  // Contracten
  if (q.includes("contract")) {
    const { rows } = await pool.query("SELECT * FROM contracts LIMIT 50");
    results.push({ type: "contracts", data: rows });
  }

  // Planning
  if (
    q.includes("planning") ||
    q.includes("bezoek") ||
    q.includes("volgende") ||
    q.includes("ingepland")
  ) {
    const { rows } = await pool.query("SELECT * FROM planning LIMIT 50");
    results.push({ type: "planning", data: rows });
  }

  // Facturen
  if (
    q.includes("factuur") ||
    q.includes("facturen") ||
    q.includes("invoice") ||
    q.includes("betaling") ||
    q.includes("betaald")
  ) {
    const { rows } = await pool.query("SELECT * FROM invoices LIMIT 50");
    results.push({ type: "invoices", data: rows });
  }

  // Leads
  if (q.includes("lead") || q.includes("aanvraag")) {
    const { rows } = await pool.query("SELECT * FROM leads LIMIT 50");
    results.push({ type: "leads", data: rows });
  }

  // Members / Medewerkers
  if (
    q.includes("member") ||
    q.includes("medewerker") ||
    q.includes("schoonmaker") ||
    q.includes("teamleider") ||
    q.includes("planner") ||
    q.includes("rol")
  ) {
    const { rows } = await pool.query("SELECT * FROM members LIMIT 50");
    results.push({ type: "members", data: rows });
  }

  // Instellingen
  if (
    q.includes("instelling") ||
    q.includes("settings") ||
    q.includes("template") ||
    q.includes("email template") ||
    q.includes("thema") ||
    q.includes("theme") ||
    q.includes("dark mode") ||
    q.includes("factuurtemplate")
  ) {
    const { rows } = await pool.query("SELECT * FROM settings LIMIT 10");
    results.push({ type: "settings", data: rows });
  }

  return results;
}


// ---------------------------
// 4. MAIN ROUTE
// ---------------------------
router.post("/ask", async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: "Vraag ontbreekt" });
  }

  // 🔥 1. Check TOOR relevance
  if (!isRelevant(question)) {
    return res.json({
      answer:
        "HAHA leuk geprobeerd, deze vraag heeft niks met TooR te maken en kan ik daar geen antwoord op geven. Probeer deze vraag bij https://chatgpt.com/"
    });
  }

  // 🔥 2. Load KB
  const kb = loadKnowledgeBase();

  // 🔥 3. Try DB extraction
  const dbData = await tryDatabase(question);

  // Als niks gevonden...
  if (!kb && !dbData.length) {
    return res.json({
      answer:
        "Oeh, goeie vraag. Ik weet het niet. Dat zou je aan de Applicatie beheerder moeten vragen."
    });
  }

  // 🔥 4. Build context text
  let context = "";
  if (kb) context += `\n### Knowledge Base\n${kb}`;
  if (dbData.length) {
    context += `\n\n### Database Extract\n${JSON.stringify(dbData, null, 2)}`;
  }

  // 🔥 5. Actual GPT call
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
JE BENT DE TOOR ERP IN-APP ASSISTANT.
- Gebruik ALLEEN de gegeven context.
- GEEN HALLUCINATIES.
- Als het antwoord niet 100% zeker is → zeg:
  "Oeh, goeie vraag. Ik weet het niet. Dat zou je aan de Applicatie beheerder moeten vragen."
- Als een vraag niet over TOOR gaat → zeg:
  "HAHA leuk geprobeerd, deze vraag heeft niks met TooR te maken en kan ik daar geen antwoord op geven. Probeer deze vraag bij https://chatgpt.com/"
`
      },
      { role: "user", content: `Vraag: ${question}\n\nCONTEXT:\n${context}` }
    ],
  });

  const answer = completion.choices[0].message.content;

  res.json({ answer });
});

export default router;
