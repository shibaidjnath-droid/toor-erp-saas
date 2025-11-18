import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import clientsRouter from "./routes/clients.js";
import invoicesRouter from "./routes/invoices.js";
import webhookRouter from './routes/webhook.js';
import tagsRouter from './routes/tags.js';
import emailLogRouter from './routes/emailLog.js';
import yukiLogRouter from "./routes/yukiLogs.js";
import settingsRouter from './routes/settings.js';
import leadsRouter from './routes/leads.js';
import quotesRouter from './routes/quotes.js';
import planningRouter from './routes/planning.js';
import whatsappRouter from "./routes/whatsapp.js";
import invoicesYukiRouter from "./routes/invoicesYuki.js";
import addressRouter from "./routes/address.js";
import contractsRouter from './routes/contracts.js';
import membersRouter from './routes/members.js';
import rolesRouter from './routes/roles.js';
import serviceTypesRouter from './routes/serviceTypes.js';
import importExportRouter from './routes/importExport.js';
import kvkRouter from "./routes/kvk.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 5000;

// static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../public')));

// routes
app.use('/api/clients', clientsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/email-log', emailLogRouter);
app.use("/api/yuki-log", yukiLogRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/planning', planningRouter);
app.use("/api/invoices-yuki", invoicesYukiRouter);
app.use("/api/address", addressRouter);
app.use("/api/kvk", kvkRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/members', membersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/service-types', serviceTypesRouter);
app.use('/api/import-export', importExportRouter);
app.use("/api/whatsapp", whatsappRouter);

// dashboard
app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// thanks
app.get('/thanks', (_req, res) => {
  res.send('<h2>Bedankt voor je betaling!</h2><p>Je factuur is succesvol voldaan.</p>');
});
app.get('/betaling/voltooid', (_req, res) => {
  res.send('<h2>Bedankt voor je betaling!</h2><p>Uw betaling is succesvol ontvangen.</p>');
});

// ⏰ Dagelijkse maandfacturatie om 15:00 Europe/Amsterdam
import cron from 'node-cron';
import axios from 'axios';

const BASE_URL = process.env.APP_URL || `http://localhost:${port}`;

cron.schedule('0 15 * * *', async () => {
  try {
    console.log('🕒 Start maandfacturatie-batch (15:00)...');
    const r = await axios.post(`${BASE_URL}/api/invoices-yuki/monthly`);
    console.log('✅ Maandfacturatie batch:', r.data?.summary || r.status);
  } catch (e) {
    console.error('❌ Fout maandfacturatie-batch:', e.message);
  }
}, { timezone: 'Europe/Amsterdam' });


/// 🔁 Dagelijkse Yuki-status-sync om 16:00 (REST)
cron.schedule('0 16 * * *', async () => {
  try {
    console.log('🕓 Start Yuki-status-sync (REST, 16:00)…');
    const r = await axios.post(`${BASE_URL}/api/invoices-yuki/sync-status`);
    console.log('✅ Status-sync:', r.data?.summary || r.status);
  } catch (e) {
    console.error('❌ Fout status-sync:', e.message);
  }
}, { timezone: 'Europe/Amsterdam' });

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
import { initWhatsApp } from "./routes/whatsapp.js";

app.listen(port, () => {
  console.log(`Server draait op poort ${port}`);

  // WhatsApp pas starten NA server boot
  setTimeout(() => {
    initWhatsApp();
  }, 2000);
});








