# Klanten Module – TOOR ERP

## Wat is een klant?
Een klant is een eindgebruiker waarvoor diensten worden uitgevoerd. Een klant bevat persoonlijke of zakelijke gegevens en kan één of meerdere contracten hebben.

## Velden
- name: Naam van de klant
- email: E-mailadres
- phone: Telefoonnummer
- address: Straatnaam
- house_number: Huisnummer
- city: Woonplaats
- type_klant: Particulier / Zakelijk
- bedrijfsnaam: Alleen verplicht bij Zakelijk
- kvk: KvK nummer voor zakelijke klanten
- btw: BTW nummer voor zakelijke klanten
- verzend_methode: Whatsapp of Email
- tag: vrij instelbaar via Instellingen → Tags
- facturatie: Manueel / Bulk / Auto
- status: Active / Inactive

## Belangrijke Business Rules
- Zakelijke klanten moeten bedrijfsnaam + kvk invullen.
- Bij aanmaken van een klant kan automatisch een contract en eerste planning worden aangemaakt.
- Bij verzendmethode = Whatsapp wordt factuur per WhatsApp verzonden (via toekomstige module).
- Bij type_klant wordt de UI dynamisch aangepast (bedrijfsvelden in/uit).

## Veelgestelde vragen
### Hoe maak ik een nieuwe klant aan?
1. Ga naar Klanten tab.
2. Klik op “Nieuw Klant”.
3. Vul minimaal naam & email in.
4. Optioneel: voeg direct contractvelden toe.
5. Opslaan.

### Hoe wijzig ik een klant?
Klik in de klantenlijst op de rij → bewerk → opslaan.
