import { startServer } from './server';

// Load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local if it exists
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

// Start the server
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});