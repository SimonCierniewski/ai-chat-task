import { startServer } from './server';
import { validateConfig } from './config';

async function main() {
  console.log('Starting API server...');
  console.log('Node version:', process.version);
  console.log('Current directory:', process.cwd());
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);
  
  try {
    validateConfig();
    await startServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

main();