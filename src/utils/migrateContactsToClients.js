import fs from "fs-extra";
import path from "path";

async function migrateContactsToClients() {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const contactsFile = path.join(dataDir, "contacts.json");
    const clientsFile = path.join(dataDir, "clients.json");

    // Check of contacts.json bestaat
    if (!(await fs.pathExists(contactsFile))) {
      console.log("❌ Geen contacts.json gevonden — niets te migreren.");
      return;
    }

    // Lees oude data
    const contacts = await fs.readJson(contactsFile);

    // Extra veiligheidscheck
    if (!Array.isArray(contacts)) {
      console.log("❌ Ongeldige contacts.json structuur.");
      return;
    }

    // Schrijf nieuwe clients.json
    await fs.writeJson(clientsFile, contacts, { spaces: 2 });

    console.log(`✅ Migratie voltooid — ${contacts.length} records gekopieerd naar clients.json`);
  } catch (err) {
    console.error("❌ Fout bij migratie:", err);
  }
}

migrateContactsToClients();
