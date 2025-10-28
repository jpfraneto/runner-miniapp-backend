#!/usr/bin/env node

/**
 * Data Recovery Script
 *
 * Recovers all running session data from Neynar's /running channel
 * after database loss. Rebuilds the entire database chronologically.
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');

async function main() {
  console.log('🚀 Starting RunnerCoin data recovery...\n');

  try {
    // Create NestJS application
    const app = await NestFactory.createApplicationContext(AppModule);

    // Get the database seeding service
    const {
      DatabaseSeedingService,
    } = require('./dist/core/admin/services/database-seeding.service');
    const seedingService = app.get(DatabaseSeedingService);

    console.log('✅ Application context created');
    console.log('📡 Starting complete database recovery from Neynar...\n');

    // Run the complete database seeding
    // This will:
    // 1. Wipe database clean
    // 2. Fetch ALL /running casts from Neynar
    // 3. Process chronologically (oldest first)
    // 4. Create running sessions & weekly leaderboards
    // 5. NO notifications will be sent (mode = 'seed')
    const result = await seedingService.seedCompleteDatabase(4); // Use 4 parallel workers

    if (result.success) {
      console.log('\n🎉 DATA RECOVERY COMPLETED SUCCESSFULLY!');
      console.log('📊 RECOVERY SUMMARY:');
      console.log(`   • Casts fetched: ${result.summary.castsFetched}`);
      console.log(`   • Casts processed: ${result.summary.castsProcessed}`);
      console.log(`   • Running sessions: ${result.summary.runningSessions}`);
      console.log(`   • Users recreated: ${result.summary.usersCreated}`);
      console.log(`   • Weekly leaderboards: ${result.summary.weeksCreated}`);
      console.log(
        `   • Leaderboard entries: ${result.summary.leaderboardEntries}`,
      );
      console.log(`   • Errors: ${result.summary.errors}`);

      if (result.weeks && result.weeks.length > 0) {
        console.log('\n🏆 WEEKLY LEADERBOARDS CREATED:');
        result.weeks.forEach((week) => {
          console.log(
            `   Week ${week.weekNumber}: ${week.entries.length} participants`,
          );
          if (week.entries[0]) {
            console.log(
              `     Top runner: ${week.entries[0].username} (${week.entries[0].totalKilometers}km)`,
            );
          }
        });
      }

      console.log('\n✅ Your RunnerCoin database has been fully recovered!');
      console.log('🚫 No notifications were sent during recovery');
    } else {
      console.error('\n❌ DATA RECOVERY FAILED');
      console.error('Error:', result.error);
      if (result.summary) {
        console.log('\n📊 PARTIAL RECOVERY SUMMARY:');
        console.log(`   • Casts fetched: ${result.summary.castsFetched}`);
        console.log(`   • Casts processed: ${result.summary.castsProcessed}`);
        console.log(`   • Running sessions: ${result.summary.runningSessions}`);
        console.log(`   • Users recreated: ${result.summary.usersCreated}`);
        console.log(`   • Errors: ${result.summary.errors}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 RECOVERY SCRIPT FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run the recovery
main();
