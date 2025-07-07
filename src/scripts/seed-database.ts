#!/usr/bin/env ts-node

import { DatabaseSeeder } from '../core/training/services/seed-database';

async function main() {
  try {
    console.log('🚀 Starting database seeding...');
    const seeder = new DatabaseSeeder();
    await seeder.seed();
    console.log('✅ Database seeding completed successfully!');
    return 0;
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    return 1;
  }
}

main().then((exitCode) => {
  process.exit(exitCode);
});
