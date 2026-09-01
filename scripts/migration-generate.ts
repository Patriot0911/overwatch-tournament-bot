import { execSync } from 'child_process';

const name = process.argv[2];

if (!name) {
  console.error('Usage: npm run migration:generate -- <MigrationName>');
  process.exit(1);
}

execSync(
  `typeorm-ts-node-commonjs -d src/database/data-source.ts migration:generate src/database/migrations/${name}`,
  {
    stdio: 'inherit',
  },
);
