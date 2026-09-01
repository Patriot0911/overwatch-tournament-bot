import 'dotenv/config';
import { AppDataSource } from '../src/database/data-source';

async function seed() {
  await AppDataSource.initialize();

  console.log('No seed data defined yet.');

  await AppDataSource.destroy();
  process.exit(0);
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
