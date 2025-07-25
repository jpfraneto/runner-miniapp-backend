import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../../../models/User/User.model';
import {
  RunningSession,
  RunningSessionStatus,
} from '../../../models/RunningSession/RunningSession.model';
import { UserRoleEnum } from '../../../models/User/User.types';
import { AppDataSource } from '../../../data-source';
import { UserStats } from '../../../models/UserStats/UserStats.model';
import { LeaderboardHistory } from '../../../models/LeaderboardHistory/LeaderboardHistory.model';
import { UserBadge } from '../../../models/UserBadge/UserBadge.model';

export class DatabaseSeeder {
  private dataSource: DataSource;
  private seedData: any;

  constructor() {
    this.dataSource = AppDataSource;
  }

  async loadSeedData(): Promise<void> {
    try {
      const seedFilePath = path.join(process.cwd(), 'workouts-seeds.json');
      const rawData = fs.readFileSync(seedFilePath, 'utf8');
      this.seedData = JSON.parse(rawData);
      console.log('✅ Seed data loaded successfully');
    } catch (error) {
      console.error('❌ Error loading seed data:', error);
      throw error;
    }
  }

  async seed(): Promise<void> {
    try {
      console.log('🚀 Starting database seeding...');
      await this.loadSeedData();
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }
      await this.clearExistingData();
      const users = await this.createUsers();
      console.log(`✅ Created ${users.length} users`);
      await this.createRunningSessions(users);
      console.log('✅ Created running sessions');
      console.log('🎉 Database seeding completed successfully!');
      // TODO: USER STATS
      // here please add the user stats, along with the models for those stats on the database.they represent "easy to access" overall stats that then can be updated each time the user runs a new session. we build on top of that.
      await this.updateUserStats();
      console.log('✅ Updated user stats and updated database');
      // TODO: LEADERBOARD HISTORY STATS
      // here please add the leaderboard history, along with the models for those stats on the database.they represent "easy to access" overall stats that then can be updated each time the user runs a new session. we build on top of that. calculate when the first run was ever shared, and that is week 0. since then, we have had N weeks, based on the runs that have been shared on farcaster.
      await this.createLeaderboardHistory();
      console.log('✅ Created leaderboard history and updated database');
      // TODO: DISTRIBUTE HISTORICAL BADGES AND AWARDS
      // create a system of badges and awards that can be distributed to users based on their running stats. first run. 10 runs. 50 runs. 100 runs. 500 runs. 1000 runs. keep it simple. eventually this will be done onchain and users will be able to claim them. but for now, create a badge mechanism on the database, and a system to distribute them as users accomplish those specific milestones..
      await this.distributeAllBadges();
      console.log('✅ Distributed all badges and updated database');
    } catch (error) {
      console.error('❌ Error during seeding:', error);
      process.exit(1);
    } finally {
      if (this.dataSource.isInitialized) {
        await this.dataSource.destroy();
      }
    }
  }

  private async clearExistingData(): Promise<void> {
    console.log('🧹 Clearing existing data...');

    try {
      // Disable foreign key checks to allow truncation
      await this.dataSource.query('SET FOREIGN_KEY_CHECKS = 0');

      console.log('🗑️  Clearing child tables first...');

      // Clear child tables first (tables that reference others)
      try {
        await this.dataSource.getRepository(UserBadge).clear();
        console.log('   ✅ Cleared UserBadge');
      } catch (e) {
        console.log('   ⚠️  UserBadge table may not exist yet');
      }

      try {
        await this.dataSource.getRepository(LeaderboardHistory).clear();
        console.log('   ✅ Cleared LeaderboardHistory');
      } catch (e) {
        console.log('   ⚠️  LeaderboardHistory table may not exist yet');
      }

      try {
        await this.dataSource.getRepository(UserStats).clear();
        console.log('   ✅ Cleared UserStats');
      } catch (e) {
        console.log('   ⚠️  UserStats table may not exist yet');
      }

      try {
        await this.dataSource.getRepository(RunningSession).clear();
        console.log('   ✅ Cleared RunningSession');
      } catch (e) {
        console.log('   ⚠️  RunningSession table may not exist yet');
      }

      // Clear parent tables last
      try {
        await this.dataSource.getRepository(User).clear();
        console.log('   ✅ Cleared User');
      } catch (e) {
        console.log('   ⚠️  User table may not exist yet');
      }
    } catch (error) {
      console.error(
        '⚠️  Error during data clearing (continuing anyway):',
        error.message,
      );
    } finally {
      // Always re-enable foreign key checks
      await this.dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ Foreign key checks re-enabled');
    }
  }

  // Alternative method using DELETE instead of CLEAR (if above doesn't work)
  private async clearExistingDataAlternative(): Promise<void> {
    console.log('🧹 Clearing existing data with DELETE...');

    try {
      // Delete in reverse dependency order
      const tablesToClear = [
        'user_badge', // Child tables first
        'leaderboard_history',
        'user_stats',
        'running_session',
        'user', // Parent tables last
      ];

      for (const tableName of tablesToClear) {
        try {
          await this.dataSource.query(`DELETE FROM \`${tableName}\``);
          // Reset auto-increment counter
          await this.dataSource.query(
            `ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`,
          );
          console.log(`   ✅ Cleared table: ${tableName}`);
        } catch (error) {
          console.log(`   ⚠️  Could not clear ${tableName}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('⚠️  Error during data clearing:', error.message);
    }
  }

  private async createUsers(): Promise<User[]> {
    const userRepo = this.dataSource.getRepository(User);
    const users = this.seedData.users.map((u: any) => {
      return userRepo.create({
        fid: u.fid,
        username: u.username,
        pfpUrl: u.pfpUrl,
        role: UserRoleEnum.USER,
        notificationsEnabled: false,
      });
    });
    return userRepo.save(users);
  }

  private async createRunningSessions(users: User[]): Promise<void> {
    const userMap = new Map(users.map((user) => [user.fid, user]));
    const runningSessionRepo = this.dataSource.getRepository(RunningSession);
    console.log('Creating running sessions from seed data...');
    const sessions = this.seedData.runs || [];
    let count = 0;
    for (const session of sessions) {
      const user = userMap.get(session.fid);
      console.log('INNNNN HERE, THE USER IS', user);
      if (!user) {
        console.log(
          `⚠️  Skipping session for FID ${session.fid} - user not found`,
        );
        continue;
      }
      console.log('INNNNN HERE, THE USER IS', user);
      const runningSession = runningSessionRepo.create({
        user: user,
        fid: user.fid,
        distanceMeters: Math.round(session.distance_meters),
        castHash: session.hash,
        duration: Math.round(session.time_seconds / 60),
        createdAt: new Date(session.timestamp),
        status: RunningSessionStatus.COMPLETED,
      });
      console.log('INNNNN HERE, THE RUNNING SESSION IS', runningSession);
      await runningSessionRepo.save(runningSession);
      count++;
    }
    console.log(`✅ Seeded ${count} running sessions`);
  }

  async updateUserStats(): Promise<void> {
    const userRepo = this.dataSource.getRepository(User);
    const statsRepo = this.dataSource.getRepository(UserStats);
    const sessionRepo = this.dataSource.getRepository(RunningSession);
    const users = await userRepo.find();
    for (const user of users) {
      const runs = await sessionRepo.find({ where: { user: user } });
      if (!runs.length) continue;
      const totalRuns = runs.length;
      const totalDistance =
        runs.reduce((sum, r) => sum + (r.distanceMeters || 0), 0) / 1000;
      const longestRun =
        Math.max(...runs.map((r) => r.distanceMeters || 0)) / 1000;
      // Best 5k/10k times (in minutes)
      let best5kTime: number | null = null;
      let best10kTime: number | null = null;
      for (const r of runs) {
        if (r.distanceMeters >= 5000 && r.distanceMeters < 6000) {
          const time = r.duration;
          if (!best5kTime || time < best5kTime) best5kTime = time;
        }
        if (r.distanceMeters >= 10000 && r.distanceMeters < 11000) {
          const time = r.duration;
          if (!best10kTime || time < best10kTime) best10kTime = time;
        }
      }
      const sortedByDate = runs
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const firstRunDate = sortedByDate[0].createdAt;
      const lastRunDate = sortedByDate[sortedByDate.length - 1].createdAt;
      let stats = await statsRepo.findOne({ where: { user: user } });
      if (!stats) {
        stats = statsRepo.create({ user });
      }
      stats.totalRuns = totalRuns;
      stats.totalDistance = Number(totalDistance.toFixed(2));
      stats.longestRun = Number(longestRun.toFixed(2));
      stats.best5kTime = best5kTime ? Number(best5kTime.toFixed(2)) : null;
      stats.best10kTime = best10kTime ? Number(best10kTime.toFixed(2)) : null;
      stats.firstRunDate = firstRunDate;
      stats.lastRunDate = lastRunDate;
      await statsRepo.save(stats);
    }
  }

  async createLeaderboardHistory(): Promise<void> {
    const sessionRepo = this.dataSource.getRepository(RunningSession);
    const leaderboardRepo = this.dataSource.getRepository(LeaderboardHistory);
    const userRepo = this.dataSource.getRepository(User);
    // Get all runs, sorted by date
    const allRuns = await sessionRepo.find({ relations: ['user'] });
    if (!allRuns.length) return;
    // Find the first run date
    const firstRunDate = allRuns.reduce(
      (min, r) => (r.createdAt < min ? r.createdAt : min),
      allRuns[0].createdAt,
    );
    // Group runs by week
    const weekMap = new Map<number, RunningSession[]>();
    for (const run of allRuns) {
      const weekNumber = Math.floor(
        (run.createdAt.getTime() - firstRunDate.getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      );
      if (!weekMap.has(weekNumber)) weekMap.set(weekNumber, []);
      weekMap.get(weekNumber)!.push(run);
    }
    // Chakra colors for medals
    const chakraColors = [
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'indigo',
      'violet',
      'white',
    ];
    for (const [weekNumber, runs] of weekMap.entries()) {
      // Calculate week start/end
      const weekStart = new Date(
        firstRunDate.getTime() + weekNumber * 7 * 24 * 60 * 60 * 1000,
      );
      const weekEnd = new Date(
        weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1,
      );
      // Aggregate distance per user
      const userDistance = new Map<number, number>();
      for (const run of runs) {
        userDistance.set(
          run.user.fid,
          (userDistance.get(run.user.fid) || 0) + (run.distanceMeters || 0),
        );
      }
      // Sort users by distance (top 8)
      const top8 = Array.from(userDistance.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      for (let i = 0; i < top8.length; i++) {
        const [fid, distanceMeters] = top8[i];
        const user = await userRepo.findOne({ where: { fid } });
        if (!user) continue;
        const entry = leaderboardRepo.create({
          weekNumber,
          startDate: weekStart,
          endDate: weekEnd,
          user,
          rank: i + 1,
          distanceKm: Number((distanceMeters / 1000).toFixed(2)),
          medalColor: chakraColors[i],
        });
        await leaderboardRepo.save(entry);
      }
    }
  }

  async distributeAllBadges(): Promise<void> {
    const badgeRepo = this.dataSource.getRepository(UserBadge);
    const userRepo = this.dataSource.getRepository(User);
    const sessionRepo = this.dataSource.getRepository(RunningSession);
    const users = await userRepo.find();
    const badgeMilestones = [1, 10, 50, 100, 500, 1000];
    for (const user of users) {
      const runs = await sessionRepo.find({
        where: { user: user },
        order: { createdAt: 'ASC' },
      });
      for (const milestone of badgeMilestones) {
        if (runs.length >= milestone) {
          // Award badge at the date of the milestone run
          const dateAwarded = runs[milestone - 1].createdAt;
          const badgeType = `${milestone}_runs`;
          // Check if badge already exists
          const exists = await badgeRepo.findOne({
            where: { user, badgeType },
          });
          if (!exists) {
            const badge = badgeRepo.create({ user, badgeType, dateAwarded });
            await badgeRepo.save(badge);
          }
        }
      }
    }
  }
}

// CLI execution
if (typeof require !== 'undefined' && require.main === module) {
  const seeder = new DatabaseSeeder();
  seeder
    .seed()
    .then(() => {
      console.log('✅ Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}
