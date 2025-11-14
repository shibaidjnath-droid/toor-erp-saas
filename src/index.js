import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Bestaand
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
// 🔥 NIEUW — deze ontbraken
import contractsRouter from './routes/contracts.js';
import membersRouter from './routes/members.js';
import rolesRouter from './routes/roles.js';
// Let op bestandsnaam: jouw file heet ServiceTypes.js
import serviceTypesRouter from './routes/serviceTypes.js';
import importExportRouter from './routes/importExport.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
//app.use('/dashboard/api/planning', planningRouter);
app.use("/api/invoices-yuki", invoicesYukiRouter);
app.use("/api/address", addressRouter);

// 🔥 NIEUW mounts
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


function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server draait op poort ${port}`);
});
