import { loadEnvFile, sanitizeErrorMessage } from './config/env.js';
import { startMcpServer } from './server.js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

loadEnvFile();

async function main() {
  await startMcpServer();
}

const isDirect =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href ===
    pathToFileURL(fileURLToPath(import.meta.url)).href;

if (isDirect) {
  main().catch((error) => {
    console.error('Failed to start AutoTestFlow MCP Server:', sanitizeErrorMessage(error));
    process.exit(1);
  });
}

export { startMcpServer };
