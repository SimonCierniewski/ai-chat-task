import { startServer } from './server';
import { validateConfig } from './config';

async function main() {
  try {
    validateConfig();
    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();