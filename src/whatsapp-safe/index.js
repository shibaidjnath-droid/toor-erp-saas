// src/whatsapp-safe/index.js
import { protectWhatsAppClient } from "./safeWrapper.js";

export function enableWhatsAppSafety(client) {
  protectWhatsAppClient(client);
}
