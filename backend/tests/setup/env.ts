import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.test into process.env before tests run
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });
