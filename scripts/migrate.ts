import 'dotenv/config';
import { AppDataSource } from '../src/database/data-source';

async function migrate() {
  await AppDataSource.initialize();
  const migrations = await AppDataSource.runMigrations();
  console.log(`Applied ${migrations.length} migration(s).`);
  await AppDataSource.destroy();
  process.exit(0);
}

migrate().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
