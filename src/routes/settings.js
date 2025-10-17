// routes/settings.js
import express from "express";
import { pool } from "../db.js"; // optioneel – alleen gebruikt als DB beschikbaar

const router = express.Router();

// ✅ Default in-memory fallback (zoals nu)
export let settings = {
  theme: "light", // or "dark"
  emailTemplate: {
    subject: "Je maandelijkse factuur {{invoiceNumber}}",
    html: `<h3>Beste {{name}},</h3>
<p>Hierbij je factuur van <strong>€{{amount}}</strong>.</p>
<p>Betaal via: <a href="{{paymentUrl}}" target="_blank">Mollie betaallink</a></p>
<p>Vriendelijke groet,<br>Team SaaS</p>`,
  },
};

/**
 * ✅ GET – huidige instellingen ophalen
 * Laadt eerst vanuit DB (indien aanwezig), anders gebruikt fallback.
 */
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM settings LIMIT 1");
    if (rows.length) {
      const dbSettings = rows[0];
      return res.json({
        theme: dbSettings.theme,
        emailTemplate: {
          subject: dbSettings.email_subject,
          html: dbSettings.email_html,
        },
      });
    }
  } catch (err) {
    console.warn("⚠️ Settings geladen via fallback (geen DB of fout):", err.message);
  }
  res.json(settings);
});

/**
 * ✅ PUT – instellingen bijwerken
 * Schrijft naar DB indien beschikbaar, anders alleen in-memory
 */
router.put("/", async (req, res) => {
  const { theme, emailTemplate } = req.body;

  // update lokale kopie
  if (theme && ["light", "dark"].includes(theme)) settings.theme = theme;
  if (emailTemplate && emailTemplate.subject && emailTemplate.html) {
    settings.emailTemplate = emailTemplate;
  }

  // probeer DB-update
  try {
    await pool.query(`
      INSERT INTO settings (id, theme, email_subject, email_html, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, now())
      ON CONFLICT (id) DO UPDATE SET
        theme = EXCLUDED.theme,
        email_subject = EXCLUDED.email_subject,
        email_html = EXCLUDED.email_html,
        updated_at = now()
    `, [
      settings.theme,
      settings.emailTemplate.subject,
      settings.emailTemplate.html,
    ]);
  } catch (err) {
    console.warn("⚠️ Settings niet opgeslagen in DB (fallback actief):", err.message);
  }

  res.json(settings);
});

export default router;
