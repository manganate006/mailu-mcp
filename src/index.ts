#!/usr/bin/env node
/**
 * Point d'entree executable du serveur MCP Mailu.
 * Toute la logique est dans ./server.ts (importable/testable sans effet de bord).
 */
import { MailuMCPServer } from './server.js';

const server = new MailuMCPServer();
server.run().catch((error) => {
  console.error(error);
  process.exit(1);
});
