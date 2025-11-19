# Facturen Module – TOOR ERP

## Wat is een factuur?
Een factuur hoort bij een klant en een bedrag. Deze kan via Mollie gekozen worden of later via Yuki.

## Velden
- invoice_number: uniek nummer (INV-YYYYMM-xxxxx)
- amount: Incl. BTW bedrag
- mollie_id: ID van Mollie payment
- payment_url: URL voor klant
- status: open / betaald / verlopen / geannuleerd
- customer: klantnaam

## Business Logica
- Factuur aanmaken doet automatisch:
  - bedrag formatteren
  - Mollie payment starten
  - Email toevoegen aan email_log
- Webhook van Mollie werkt status bij

## Veelgestelde vragen
### Hoe wordt een factuur betaald?
Via de payment_url die automatisch wordt gegenereerd.

### Wat gebeurt er als betaling verloopt?
Status wordt “verlopen” via webhook.
