import { contacts } from '../routes/contacts.js';
import { invoices } from '../routes/invoices.js';
import { purchases } from '../routes/purchases.js';

export function searchAll(query) {
  const q = (query || '').toLowerCase().trim();
  const results = [];

  if (!q) return results;

  contacts.forEach(c => {
    const hay = `${c.name} ${c.email} ${c.address} ${c.phone}`.toLowerCase();
    if (hay.includes(q)) results.push({ type: 'contacts', id: c.id, label: c.name });
  });

  invoices.forEach(i => {
    const hay = `${i.customer} ${i.id} ${i.status}`.toLowerCase();
    if (hay.includes(q)) results.push({ type: 'invoices', id: i.id, label: `${i.customer} (€${i.amount})` });
  });

  purchases.forEach(p => {
    const hay = `${p.supplier} ${p.description} ${p.id} ${p.status}`.toLowerCase();
    if (hay.includes(q)) results.push({ type: 'purchases', id: p.id, label: `${p.supplier} (€${p.amount})` });
  });

  return results;
}
