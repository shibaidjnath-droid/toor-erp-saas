// routes/importExport.js
import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import fs from "fs";
import { pool } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

/**
 * Helper: definieer per type (clients, invoices, etc.)
 * wat de tabellen, velden en joins zijn.
 */
const configMap = {
  clients: {
    table: "contacts",
    join: `
      LEFT JOIN contracts ct ON c.id = ct.contact_id
    `,
    columns: [
      "c.id", "c.name", "c.email", "c.phone", "c.address", "c.house_number",
      "c.city", "c.type_klant", "c.bedrijfsnaam", "c.kvk", "c.btw",
      "c.verzend_methode", "c.tag", "c.status", "c.created_at",
      "ct.id AS contract_id", "ct.type_service", "ct.frequency", "ct.description",
      "ct.price_ex", "ct.price_inc", "ct.vat_pct", "ct.last_visit", "ct.next_visit"
    ],
  },
};

/**
 * ✅ GET /api/import-export?type=clients
 * Exporteer alle records voor het opgegeven type als XLSX
 */
router.get("/", async (req, res) => {
  const type = req.query.type;
  if (!configMap[type]) return res.status(400).json({ error: "Invalid type" });

  const cfg = configMap[type];
  try {
    const { rows } = await pool.query(`
      SELECT ${cfg.columns.join(", ")}
      FROM ${cfg.table} c
      ${cfg.join || ""}
      ORDER BY c.created_at DESC
    `);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${type}_export_${new Date().toISOString().split("T")[0]}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (err) {
    console.error("❌ Export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

/**
 * ✅ POST /api/import-export?type=clients
 * Importeer CSV/XLSX met bulk klanten (en optioneel contracten)
 */
router.post("/", upload.single("file"), async (req, res) => {
  const type = req.query.type;
  if (!configMap[type]) return res.status(400).json({ error: "Invalid type" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    fs.unlinkSync(req.file.path); // verwijder temp-file

    let inserted = 0;

    for (const r of rows) {
      if (!r.name || !r.email) continue;

      const clientId = uuidv4();

      // ✅ Veilige JSON-handling voor tag
      let safeTag = [];
      try {
        if (Array.isArray(r.tag)) safeTag = r.tag;
        else if (typeof r.tag === "string" && r.tag.trim() !== "")
          safeTag = [r.tag.trim()];
      } catch { safeTag = []; }

      await pool.query(
        `INSERT INTO contacts (
          id, name, email, phone, address, house_number, city,
          type_klant, bedrijfsnaam, kvk, btw, verzend_methode, tag, status, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
        [
          clientId,
          r.name,
          r.email,
          r.phone || "",
          r.address || "",
          r.houseNumber || "",
          r.city || "",
          ["Particulier", "Zakelijk"].includes(r.typeKlant)
            ? r.typeKlant
            : "Particulier",
          r.bedrijfsnaam || "",
          r.kvk || "",
          r.btw || "",
          ["Whatsapp", "Email"].includes(r.verzendMethode)
            ? r.verzendMethode
            : "Email",
          JSON.stringify(safeTag), // ✅ Altijd geldige JSON-array
          r.status || "Active",
        ]
      );

      // ✅ Eventueel gekoppeld contract
      if (r.contract_description || r.contract_typeService) {
        const vat = parseFloat(r.contract_vat || 21);
        const priceInc = parseFloat(r.contract_priceInc || 0);
        const priceEx = +(priceInc / (1 + vat / 100)).toFixed(2);

        // ✅ Veilige JSON-handling voor type_service
        let safeServices = [];
        try {
          if (Array.isArray(r.contract_typeService)) safeServices = r.contract_typeService;
          else if (typeof r.contract_typeService === "string" && r.contract_typeService.trim() !== "")
            safeServices = [r.contract_typeService.trim()];
        } catch { safeServices = []; }

        await pool.query(
          `INSERT INTO contracts (
            id, contact_id, type_service, frequency, description,
            price_ex, price_inc, vat_pct, last_visit, next_visit, active, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,now())`,
          [
            uuidv4(),
            clientId,
            JSON.stringify(safeServices), // ✅ Altijd geldige JSON-array
            r.contract_frequency || "Maand",
            r.contract_description || "",
            priceEx,
            priceInc,
            vat,
            r.contract_lastVisit || null,
            new Date().toISOString(),
          ]
        );
      }

      inserted++;
    }

    res.json({ ok: true, inserted });
  } catch (err) {
    console.error("❌ Import error:", err);
    res.status(500).json({ error: "Import failed" });
  }
});

export default router;
