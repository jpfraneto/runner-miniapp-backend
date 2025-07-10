import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource } from '../../../data-source';
import { User } from '../../../models/User/User.model';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';
import { UserRoleEnum } from '../../../models/User/User.types';
import { UnitType } from '../../../models/RunningSession/RunningSession.model';

/** Converts anything to a number or returns the fallback (0 by default). */
const toNumber = (value: unknown, fallback: number | null = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

interface WorkoutSeedData {
  summary: {
    totalProcessedSessions: number;
    totalWorkoutSessions: number;
    uniqueUsersWithWorkouts: number;
    workoutDetectionRate: number;
    totalDistance: number;
    totalDuration: number;
  };
  processedSessions: Array<{
    castHash: string;
    timestamp: string;
    text: string;
    author: {
      fid: number;
      username: string;
      pfp_url: string;
    };
    embeds: Array<{
      url: string;
      metadata: any;
    }>;
    workoutData: {
      isWorkoutImage: boolean;
      confidence: number;
      distance?: number;
      duration?: number;
      units?: string;
      pace?: string;
      calories?: number;
      elevationGain?: number;
      avgCadence?: number;
      extractedText?: string[];
      errorMessage?: string;
    };
    reactions: {
      likes_count: number;
      recasts_count: number;
      likes: any[];
      recasts: any[];
    };
    replies: {
      count: number;
    };
  }>;
}

export class DatabaseSeeder {
  private dataSource: DataSource;
  private seedData: WorkoutSeedData;

  constructor() {
    this.dataSource = AppDataSource;
  }

  async loadSeedData(): Promise<void> {
    try {
      const seedFilePath = path.join(process.cwd(), 'workouts-seeds.json');
      const rawData = fs.readFileSync(seedFilePath, 'utf8');
      this.seedData = JSON.parse(rawData);
      console.log('✅ Seed data loaded successfully');
      console.log(
        `📊 Found ${this.seedData.summary.uniqueUsersWithWorkouts} users with ${this.seedData.summary.totalWorkoutSessions} workouts`,
      );
    } catch (error) {
      console.error('❌ Error loading seed data:', error);
      throw error;
    }
  }

  async seed(): Promise<void> {
    try {
      console.log('🚀 Starting database seeding...');

      // Load seed data
      await this.loadSeedData();

      // Initialize database connection
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
      }

      // Clear existing data
      await this.clearExistingData();

      // Create users from seed data
      const users = await this.createUsers();
      console.log(`✅ Created ${users.length} users`);

      // Create workout data for each user
      await this.createWorkoutData(users);
      console.log('✅ Created workout data');

      console.log('🎉 Database seeding completed successfully!');
    } catch (error) {
      console.error('❌ Error during seeding:', error);
      throw error;
    }
  }

  private async clearExistingData(): Promise<void> {
    console.log('🧹 Clearing existing data...');

    const entities = [RunningSession, FarcasterCast, User];

    // Disable foreign key checks
    await this.dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const entity of entities) {
      await this.dataSource.getRepository(entity).clear();
    }
    // Re-enable foreign key checks
    await this.dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  private async createUsers(): Promise<User[]> {
    console.log('👥 Creating users...');

    const userRepository = this.dataSource.getRepository(User);
    const users: User[] = [];

    // Get unique users from seed data
    const uniqueUsers = new Map<number, any>();

    this.seedData.processedSessions.forEach((session) => {
      const { fid, username, pfp_url } = session.author;
      if (!uniqueUsers.has(fid)) {
        uniqueUsers.set(fid, { fid, username, pfp_url });
      }
    });

    // Create user entities
    for (const [fid, userData] of uniqueUsers) {
      const coachPersonalities = [
        'motivational',
        'supportive',
        'strict',
      ] as const;

      const user = userRepository.create({
        fid: userData.fid,
        username: userData.username,
        pfpUrl: userData.pfp_url,
        role: UserRoleEnum.USER,
        notificationsEnabled: Math.random() > 0.5,
        runnerTokens: Math.floor(Math.random() * 1000),
        lifetimeTokensEarned: Math.floor(Math.random() * 2000),
        tokensSpent: Math.floor(Math.random() * 500),
        totalRuns: 0,
        totalDistance: 0,
        totalTimeMinutes: 0,
        currentStreak: 0,
        longestStreak: 0,
        weeklyCompletions: 0,
        hasActiveTrainingPlan: false,
        hasCompletedOnboarding: true,
        unitPreference: Math.random() > 0.5 ? 'metric' : 'imperial',
        fitnessLevel: ['beginner', 'intermediate', 'advanced'][
          Math.floor(Math.random() * 3)
        ] as 'beginner' | 'intermediate' | 'advanced',
        preferredWeeklyFrequency: [2, 3, 4, 5][Math.floor(Math.random() * 4)],
        reminderTime: ['06:00', '07:00', '18:00'][
          Math.floor(Math.random() * 3)
        ],
        timezone: 'UTC',
        coachPersonality:
          coachPersonalities[
            Math.floor(Math.random() * coachPersonalities.length)
          ],
        shareByDefault: Math.random() > 0.3,
        privateProfile: Math.random() > 0.7,
        lastActiveAt: new Date(),
      });

      const savedUser = await userRepository.save(user);
      users.push(savedUser);
    }

    return users;
  }

  private async createWorkoutData(users: User[]): Promise<void> {
    console.log('🏃 Creating workout data...');

    const userMap = new Map(users.map((user) => [user.fid, user]));
    const runningSessionRepository =
      this.dataSource.getRepository(RunningSession);
    const farcasterCastRepository =
      this.dataSource.getRepository(FarcasterCast);

    const workoutSessions = this.seedData.processedSessions.filter(
      (session) =>
        session.workoutData.isWorkoutImage &&
        session.workoutData.confidence > 0.5,
    );

    console.log(`📊 Processing ${workoutSessions.length} workout sessions...`);

    for (const session of workoutSessions) {
      const user = userMap.get(session.author.fid);
      if (!user) continue;

      const workoutData = session.workoutData;
      const completedDate = new Date(session.timestamp);

      // Create RunningSession - ensure all numeric values are properly converted
      const runningSession = runningSessionRepository.create({
        userId: user.id,
        fid: user.fid,
        comment: session.text,
        isWorkoutImage: true,
        distance: toNumber(workoutData.distance),
        duration: toNumber(workoutData.duration),
        units: workoutData.units === 'mi' ? UnitType.MI : UnitType.KM,
        pace:
          typeof workoutData.pace === 'string' ? workoutData.pace : '5:30/km',
        confidence: toNumber(workoutData.confidence, 0.8),
        extractedText: session.text ? [session.text] : [],
        completedDate: completedDate,
        createdAt: completedDate, // Use session timestamp for createdAt
        calories: toNumber(workoutData.calories),
        avgHeartRate: null,
        maxHeartRate: null,
        isPersonalBest: false,
        personalBestType: null,
        screenshotUrls: session.embeds[0]?.url ? [session.embeds[0].url] : [],
        rawText: session.text,
        notes: session.text,
        castHash: session.castHash,
      });

      const savedRunningSession =
        await runningSessionRepository.save(runningSession);

      // Create FarcasterCast - ensure numeric values are properly converted
      const farcasterCast = farcasterCastRepository.create({
        userId: user.id,
        completedRunId: savedRunningSession.id,
        farcasterCastHash: session.castHash,
        imageUrl: session.embeds[0]?.url || '',
        caption: session.text,
        likes: toNumber(session.reactions.likes_count, 0),
        comments: toNumber(session.replies.count, 0),
        shares: toNumber(session.reactions.recasts_count, 0),
      });

      await farcasterCastRepository.save(farcasterCast);

      // Update user stats - ensure all values are numbers
      user.totalRuns = toNumber(user.totalRuns) + 1;
      user.totalDistance =
        toNumber(user.totalDistance) + toNumber(workoutData.distance);
      user.totalTimeMinutes =
        toNumber(user.totalTimeMinutes) + toNumber(workoutData.duration);
      user.totalShares = toNumber(user.totalShares) + 1;
      user.totalLikes =
        toNumber(user.totalLikes) + toNumber(session.reactions.likes_count);
      user.lastRunDate = completedDate;
      user.lastActiveAt = completedDate;

      await this.dataSource.getRepository(User).save(user);
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
