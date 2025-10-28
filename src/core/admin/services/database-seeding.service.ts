import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SocialService } from '../../../core/farcaster/services/social.service';
import { CastFetchingService } from './cast-fetching.service';
import { LeaderboardService } from '../../../core/leaderboard/services/leaderboard.service';
import {
  RunningSession,
  RunningSessionStatus,
} from '../../../models/RunningSession/RunningSession.model';
import { User } from '../../../models/User/User.model';
import { LeaderboardHistory } from '../../../models/LeaderboardHistory/LeaderboardHistory.model';
import { UserStats } from '../../../models/UserStats/UserStats.model';

interface CastData {
  castHash: string;
  author: {
    fid: number;
    username: string;
    pfp_url: string;
  };
  text: string;
  timestamp: string;
  embeds: any[];
  reactions: {
    likes_count: number;
    recasts_count: number;
    likes: any[];
    recasts: any[];
  };
  replies: {
    count: number;
  };
}

interface SeededLeaderboard {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  entries: Array<{
    fid: number;
    username: string;
    totalKilometers: number;
    rank: number;
  }>;
}

@Injectable()
export class DatabaseSeedingService {
  private readonly logger = new Logger(DatabaseSeedingService.name);

  // Friday 2pm Chile time = Friday 17:00 UTC (Chile is UTC-3)
  private readonly CHILE_OFFSET_HOURS = -3;
  private readonly WEEK_RESET_HOUR_CHILE = 14; // 2pm Chile time
  private readonly WEEK_RESET_HOUR_UTC =
    this.WEEK_RESET_HOUR_CHILE - this.CHILE_OFFSET_HOURS; // 17:00 UTC

  constructor(
    private readonly dataSource: DataSource,
    private readonly socialService: SocialService,
    private readonly castFetchingService: CastFetchingService,
    private readonly leaderboardService: LeaderboardService,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepo: Repository<RunningSession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(LeaderboardHistory)
    private readonly leaderboardHistoryRepo: Repository<LeaderboardHistory>,
    @InjectRepository(UserStats)
    private readonly userStatsRepo: Repository<UserStats>,
  ) {}

  /**
   * Complete database seeding process
   * 1. Wipe database clean (unless resuming)
   * 2. Fetch ALL casts from /running channel
   * 3. Process chronologically (oldest first)
   * 4. Create weekly leaderboards
   */
  async seedCompleteDatabase(
    concurrency: number = 4,
    resume: boolean = false,
  ): Promise<{
    success: boolean;
    summary: {
      castsFetched: number;
      castsProcessed: number;
      runningSessions: number;
      usersCreated: number;
      weeksCreated: number;
      leaderboardEntries: number;
      errors: number;
    };
    weeks?: SeededLeaderboard[];
    error?: string;
  }> {
    this.logger.log('🌱 Starting complete database seeding process...');

    const summary = {
      castsFetched: 0,
      castsProcessed: 0,
      runningSessions: 0,
      usersCreated: 0,
      weeksCreated: 0,
      leaderboardEntries: 0,
      errors: 0,
    };

    try {
      // Step 1: Wipe database clean (unless resuming)
      if (!resume) {
        this.logger.log('🧹 Step 1: Wiping database clean...');
        await this.wipeDatabaseClean();
        this.logger.log('✅ Database wiped clean');
      } else {
        this.logger.log('🔄 Step 1: Resuming from existing data - skipping wipe');
      }

      // Step 2: Fetch ALL casts from /running channel
      this.logger.log('📡 Step 2: Fetching ALL casts from /running channel...');
      const allCasts = await this.fetchAllRunningCasts();
      summary.castsFetched = allCasts.length;
      this.logger.log(
        `✅ Fetched ${allCasts.length} casts from /running channel`,
      );

      // Step 3: Filter and sort casts (skip already processed if resuming)
      this.logger.log(
        '📅 Step 3: Sorting casts chronologically (oldest first)...',
      );
      let sortedCasts = this.sortCastsChronologically(allCasts);
      
      if (resume) {
        this.logger.log('🔄 Filtering out already processed casts...');
        sortedCasts = await this.filterUnprocessedCasts(sortedCasts);
        this.logger.log(`📊 Found ${sortedCasts.length} unprocessed casts to resume from`);
      }
      
      this.logger.log(`✅ Sorted ${sortedCasts.length} casts chronologically`);

      // Step 4: Process casts in parallel through pipeline
      this.logger.log(
        `⚙️ Step 4: Processing ${sortedCasts.length} casts in parallel with ${concurrency} workers...`,
      );
      const startTime = Date.now();
      const processResults = await this.processCastsInParallel(
        sortedCasts,
        'seed',
        concurrency, // Use configurable concurrency
      );
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      this.logger.log(
        `⏱️ Parallel processing completed in ${processingTime.toFixed(2)} seconds`,
      );
      summary.castsProcessed = processResults.processed;
      summary.runningSessions = processResults.runningSessions;
      summary.usersCreated = processResults.usersCreated;
      summary.errors = processResults.errors;

      // Step 5: Generate weekly leaderboards
      this.logger.log('🏆 Step 5: Generating weekly leaderboards...');
      const weeklyLeaderboards = await this.generateWeeklyLeaderboards();
      summary.weeksCreated = weeklyLeaderboards.length;
      summary.leaderboardEntries = weeklyLeaderboards.reduce(
        (sum, week) => sum + week.entries.length,
        0,
      );

      this.logger.log('🎉 Complete database seeding finished successfully!');
      this.logger.log('📊 SEEDING SUMMARY:');
      this.logger.log(`   • Casts fetched: ${summary.castsFetched}`);
      this.logger.log(`   • Casts processed: ${summary.castsProcessed}`);
      this.logger.log(`   • Running sessions: ${summary.runningSessions}`);
      this.logger.log(`   • Users created: ${summary.usersCreated}`);
      this.logger.log(`   • Weeks created: ${summary.weeksCreated}`);
      this.logger.log(
        `   • Leaderboard entries: ${summary.leaderboardEntries}`,
      );
      this.logger.log(`   • Errors: ${summary.errors}`);

      return {
        success: true,
        summary,
        weeks: weeklyLeaderboards,
      };
    } catch (error) {
      this.logger.error('❌ Database seeding failed:', error);
      return {
        success: false,
        summary,
        error: error.message,
      };
    }
  }

  /**
   * Wipe database clean - remove all running-related data
   */
  private async wipeDatabaseClean(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Delete in correct order to respect foreign key constraints
      await queryRunner.query('DELETE FROM leaderboard_history');
      await queryRunner.query('DELETE FROM user_stats');
      await queryRunner.query('DELETE FROM running_sessions');
      await queryRunner.query('DELETE FROM users'); // Keep admin users

      await queryRunner.commitTransaction();
      this.logger.log('✅ Database tables wiped clean');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Failed to wipe database:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Fetch ALL casts from /running channel (not just stored ones)
   */
  private async fetchAllRunningCasts(): Promise<CastData[]> {
    // First try to get maximum number of stored casts
    await this.castFetchingService.scrapeNewCasts();

    // For now, use stored casts - in production you might want to implement
    // a more comprehensive fetching strategy that goes back further
    const storedCasts = await this.castFetchingService.getCastsData();

    this.logger.log(`📦 Retrieved ${storedCasts.length} casts from storage`);
    return storedCasts;
  }

  /**
   * Sort casts chronologically (oldest first)
   */
  private sortCastsChronologically(casts: CastData[]): CastData[] {
    return casts.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateA - dateB; // Oldest first
    });
  }

  /**
   * Filter out casts that have already been processed (for resume functionality)
   */
  private async filterUnprocessedCasts(casts: CastData[]): Promise<CastData[]> {
    this.logger.log(`🔍 Checking ${casts.length} casts for processing status...`);
    
    const processedHashes = new Set<string>();
    
    // Get all existing running sessions in batches to avoid memory issues
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const sessions = await this.runningSessionRepo.find({
        select: ['castHash'],
        skip: offset,
        take: batchSize,
      });
      
      sessions.forEach(session => {
        processedHashes.add(session.castHash);
      });
      
      hasMore = sessions.length === batchSize;
      offset += batchSize;
    }
    
    this.logger.log(`📊 Found ${processedHashes.size} already processed casts in database`);
    
    // Filter out already processed casts
    const unprocessedCasts = casts.filter(cast => !processedHashes.has(cast.castHash));
    
    this.logger.log(`✅ ${unprocessedCasts.length} casts remain to be processed`);
    return unprocessedCasts;
  }

  /**
   * Create or update running session with initial processing state
   */
  private async createInitialRunningSession(castData: CastData): Promise<void> {
    try {
      // Find the user
      const user = await this.userRepo.findOne({
        where: { fid: castData.author.fid },
      });

      if (!user) {
        this.logger.warn(
          `⚠️ User not found for FID: ${castData.author.fid}, skipping running session creation`,
        );
        return;
      }

      // Create or update running session
      const castTimestamp = new Date(castData.timestamp);

      const runningSession = new RunningSession();
      runningSession.castHash = castData.castHash;
      runningSession.fid = castData.author.fid;
      runningSession.user = user;
      runningSession.duration = 0;
      runningSession.distanceMeters = 0;
      runningSession.reasoning = '';
      runningSession.status = RunningSessionStatus.PROCESSING;
      runningSession.createdAt = castTimestamp;
      runningSession.updatedAt = castTimestamp;

      // Use upsert to create or overwrite existing session
      await this.runningSessionRepo.save(runningSession);

      this.logger.log(
        `💾 Created initial running session: ${castData.author.username} (${castData.castHash.substring(0, 20)}...)`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error creating initial running session for cast ${castData.castHash.substring(0, 20)}...:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Process casts sequentially through the pipeline
   */
  private async processCastsInParallel(
    casts: CastData[],
    mode: string,
    concurrency: number = 4,
  ): Promise<{
    processed: number;
    runningSessions: number;
    usersCreated: number;
    errors: number;
  }> {
    let processed = 0;
    let runningSessions = 0;
    let errors = 0;

    // Step 1: Create all unique users first
    this.logger.log('👥 Step 4a: Creating all unique users from casts...');
    const usersCreated = await this.createUsersFromCasts(casts);
    this.logger.log(`✅ Created ${usersCreated} unique users`);

    // Step 2: Process casts through pipeline in parallel
    this.logger.log(
      `⚙️ Step 4b: Processing ${casts.length} casts in parallel with ${concurrency} workers...`,
    );

    // Split casts into chunks for parallel processing
    const chunks = this.chunkArray(
      casts,
      Math.ceil(casts.length / concurrency),
    );
    this.logger.log(
      `📦 Split into ${chunks.length} chunks for parallel processing`,
    );

    // Process chunks in parallel
    const chunkResults = await Promise.all(
      chunks.map(async (chunk, chunkIndex) => {
        this.logger.log(
          `🚀 Starting chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} casts`,
        );

        const chunkStats = {
          processed: 0,
          runningSessions: 0,
          errors: 0,
        };

        // Process each cast in the chunk
        for (const [index, castData] of chunk.entries()) {
          const globalIndex =
            chunkIndex * Math.ceil(casts.length / concurrency) + index;

          try {
            this.logger.log(
              `🔄 [Worker ${chunkIndex + 1}] Processing cast ${globalIndex + 1}/${casts.length}: ${castData.author.username} (FID: ${castData.author.fid}) - ${castData.castHash.substring(0, 20)}...`,
            );

            // Convert cast to webhook format
            const webhookData = this.convertCastToWebhookFormat(castData);

            // Create initial running session with processing status
            await this.createInitialRunningSession(castData);

            // Process through social service pipeline
            const result = await this.socialService.processCastWebhook(
              {
                created_at: new Date(castData.timestamp).getTime(),
                type: 'cast.created',
                data: webhookData,
              },
              'seed',
            );

            chunkStats.processed++;

            if (result.processed && result.isWorkoutImage) {
              chunkStats.runningSessions++;
              this.logger.log(
                `✅ [Worker ${chunkIndex + 1}] Created running session: ${castData.author.username} (FID: ${castData.author.fid}) - ${result.distance || 'N/A'}km in ${result.duration || 'N/A'}min`,
              );
            } else if (result.processed) {
              this.logger.log(
                `⏭️ [Worker ${chunkIndex + 1}] Processed but not a workout: ${castData.author.username} (FID: ${castData.author.fid})`,
              );
            } else {
              this.logger.log(
                `⏭️ [Worker ${chunkIndex + 1}] Skipped (not processed): ${castData.author.username} (FID: ${castData.author.fid}) - ${result.reason || 'No reason provided'}`,
              );
            }

            // Small delay to avoid overwhelming the system
            if (index % 5 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          } catch (error) {
            chunkStats.errors++;
            this.logger.error(
              `❌ [Worker ${chunkIndex + 1}] Error processing cast ${castData.castHash.substring(0, 20)}... from ${castData.author.username} (FID: ${castData.author.fid}):`,
              error.message,
            );

            // Log the full error stack for debugging
            if (error.stack) {
              this.logger.error(`   Stack trace: ${error.stack}`);
            }
          }
        }

        this.logger.log(
          `✅ [Worker ${chunkIndex + 1}] Completed chunk: ${chunkStats.processed} processed, ${chunkStats.runningSessions} sessions, ${chunkStats.errors} errors`,
        );
        return chunkStats;
      }),
    );

    // Aggregate results from all chunks
    chunkResults.forEach((chunkStats) => {
      processed += chunkStats.processed;
      runningSessions += chunkStats.runningSessions;
      errors += chunkStats.errors;
    });

    this.logger.log(
      `🎉 Parallel processing completed: ${processed} processed, ${runningSessions} sessions, ${errors} errors`,
    );
    return { processed, runningSessions, usersCreated, errors };
  }

  /**
   * Helper method to split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Create all unique users from casts before processing
   */
  private async createUsersFromCasts(casts: CastData[]): Promise<number> {
    // Extract unique authors
    const uniqueAuthors = new Map<number, CastData['author']>();

    casts.forEach((cast) => {
      const author = cast.author;
      if (!uniqueAuthors.has(author.fid)) {
        uniqueAuthors.set(author.fid, author);
      }
    });

    this.logger.log(`📊 Found ${uniqueAuthors.size} unique authors to create`);

    let created = 0;
    let existing = 0;
    let errors = 0;

    for (const [fid, author] of uniqueAuthors) {
      try {
        // Check if user already exists
        const existingUser = await this.userRepo.findOne({ where: { fid } });

        if (existingUser) {
          existing++;
          this.logger.log(
            `👤 User already exists: ${author.username} (FID: ${fid})`,
          );
          continue;
        }

        // Create new user
        const newUser = new User();
        newUser.fid = fid;
        newUser.username = author.username;
        newUser.pfpUrl = author.pfp_url;
        newUser.createdAt = new Date();
        newUser.updatedAt = new Date();

        await this.userRepo.save(newUser);
        created++;

        this.logger.log(`✅ Created user: ${author.username} (FID: ${fid})`);

        // Create user stats
        const userStats = new UserStats();
        userStats.fid = fid;
        userStats.user = newUser;
        userStats.createdAt = new Date();
        userStats.updatedAt = new Date();

        await this.userStatsRepo.save(userStats);
        this.logger.log(
          `📊 Created user stats for: ${author.username} (FID: ${fid})`,
        );
      } catch (error) {
        errors++;
        this.logger.error(
          `❌ Error creating user ${author.username} (FID: ${fid}):`,
          error.message,
        );
      }
    }

    this.logger.log(`👥 User creation summary:`);
    this.logger.log(`   • Created: ${created}`);
    this.logger.log(`   • Already existed: ${existing}`);
    this.logger.log(`   • Errors: ${errors}`);

    return created;
  }

  /**
   * Generate weekly leaderboards starting from week 0
   */
  private async generateWeeklyLeaderboards(): Promise<SeededLeaderboard[]> {
    // Find the earliest running session to determine week 0
    const earliestSession = await this.runningSessionRepo.findOne({
      where: { status: RunningSessionStatus.COMPLETED },
      order: { createdAt: 'ASC' },
    });

    if (!earliestSession) {
      this.logger.log(
        '⚠️ No running sessions found, no leaderboards to create',
      );
      return [];
    }

    const week0Start = this.calculateWeek0Start(earliestSession.createdAt);
    this.logger.log(
      `📅 Week 0 starts at: ${week0Start.toISOString()} (${this.formatChileTime(week0Start)})`,
    );

    // Calculate how many weeks have passed
    const now = new Date();
    const totalWeeks = this.calculateWeeksSinceStart(week0Start, now);

    this.logger.log(
      `📊 Generating leaderboards for ${totalWeeks + 1} weeks (week 0 to week ${totalWeeks})`,
    );

    const weeklyLeaderboards: SeededLeaderboard[] = [];

    // Generate leaderboards for each week
    for (let weekNumber = 0; weekNumber <= totalWeeks; weekNumber++) {
      const weekRange = this.calculateWeekRange(week0Start, weekNumber);
      const weekLeaderboard = await this.generateLeaderboardForWeek(
        weekNumber,
        weekRange,
      );

      if (weekLeaderboard.entries.length > 0) {
        weeklyLeaderboards.push(weekLeaderboard);
        await this.saveLeaderboardToHistory(weekLeaderboard);
        this.logger.log(
          `✅ Week ${weekNumber}: ${weekLeaderboard.entries.length} participants`,
        );
      }
    }

    return weeklyLeaderboards;
  }

  /**
   * Calculate week 0 start based on first running session
   * Find the Friday 2pm Chile time before or on the earliest session
   */
  private calculateWeek0Start(earliestSessionDate: Date): Date {
    const sessionUTC = new Date(earliestSessionDate);

    // Convert to Chile time to find the correct Friday
    const sessionChile = new Date(
      sessionUTC.getTime() + this.CHILE_OFFSET_HOURS * 60 * 60 * 1000,
    );

    // Find the Friday 2pm Chile time before or on this date
    const dayOfWeek = sessionChile.getDay(); // 0 = Sunday, 5 = Friday
    const hour = sessionChile.getHours();

    let daysToSubtract = 0;

    if (
      dayOfWeek < 5 ||
      (dayOfWeek === 5 && hour < this.WEEK_RESET_HOUR_CHILE)
    ) {
      // Before this week's Friday 2pm, so go to previous Friday
      daysToSubtract = dayOfWeek + 2; // +2 because we want previous Friday
    } else {
      // After this week's Friday 2pm, so use this Friday
      daysToSubtract = dayOfWeek - 5;
    }

    const week0StartChile = new Date(sessionChile);
    week0StartChile.setDate(week0StartChile.getDate() - daysToSubtract);
    week0StartChile.setHours(this.WEEK_RESET_HOUR_CHILE, 0, 0, 0);

    // Convert back to UTC
    const week0StartUTC = new Date(
      week0StartChile.getTime() - this.CHILE_OFFSET_HOURS * 60 * 60 * 1000,
    );

    return week0StartUTC;
  }

  /**
   * Calculate how many weeks have passed since week 0 start
   */
  private calculateWeeksSinceStart(
    week0Start: Date,
    currentDate: Date,
  ): number {
    const diffMs = currentDate.getTime() - week0Start.getTime();
    const weeksSinceStart = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.max(0, weeksSinceStart);
  }

  /**
   * Calculate week range for a specific week number
   */
  private calculateWeekRange(
    week0Start: Date,
    weekNumber: number,
  ): { startDate: Date; endDate: Date } {
    const startDate = new Date(week0Start);
    startDate.setTime(
      startDate.getTime() + weekNumber * 7 * 24 * 60 * 60 * 1000,
    );

    const endDate = new Date(startDate);
    endDate.setTime(endDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    return { startDate, endDate };
  }

  /**
   * Generate leaderboard for specific week
   */
  private async generateLeaderboardForWeek(
    weekNumber: number,
    weekRange: { startDate: Date; endDate: Date },
  ): Promise<SeededLeaderboard> {
    // Get all running sessions for this week
    const sessions = await this.runningSessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where(
        'session.createdAt >= :startDate AND session.createdAt < :endDate',
        {
          startDate: weekRange.startDate.toISOString(),
          endDate: weekRange.endDate.toISOString(),
        },
      )
      .andWhere('session.status = :status', {
        status: RunningSessionStatus.COMPLETED,
      })
      .getMany();

    // Group by user and calculate totals
    const userTotals = new Map<number, { user: User; totalKm: number }>();

    sessions.forEach((session) => {
      if (!session.user) return;

      const fid = session.user.fid;
      const distanceKm = (session.distanceMeters || 0) / 1000;

      if (userTotals.has(fid)) {
        userTotals.get(fid)!.totalKm += distanceKm;
      } else {
        userTotals.set(fid, {
          user: session.user,
          totalKm: distanceKm,
        });
      }
    });

    // Sort by distance and create entries
    const entries = Array.from(userTotals.entries())
      .map(([fid, data]) => ({
        fid,
        username: data.user.username,
        totalKilometers: Math.round(data.totalKm * 100) / 100,
        rank: 0, // Will be set after sorting
      }))
      .sort((a, b) => b.totalKilometers - a.totalKilometers)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    return {
      weekNumber,
      startDate: weekRange.startDate,
      endDate: weekRange.endDate,
      entries,
    };
  }

  /**
   * Save leaderboard to LeaderboardHistory table
   */
  private async saveLeaderboardToHistory(
    leaderboard: SeededLeaderboard,
  ): Promise<void> {
    const historyEntries = leaderboard.entries.map((entry) => {
      const historyEntry = new LeaderboardHistory();
      historyEntry.fid = entry.fid;
      historyEntry.weekNumber = leaderboard.weekNumber;
      historyEntry.startDate = leaderboard.startDate;
      historyEntry.endDate = leaderboard.endDate;
      historyEntry.rank = entry.rank;
      historyEntry.distanceKm = entry.totalKilometers;

      // Assign medal colors
      if (entry.rank === 1) historyEntry.medalColor = 'gold';
      else if (entry.rank === 2) historyEntry.medalColor = 'silver';
      else if (entry.rank === 3) historyEntry.medalColor = 'bronze';
      else historyEntry.medalColor = 'none';

      return historyEntry;
    });

    await this.leaderboardHistoryRepo.save(historyEntries);
  }

  /**
   * Convert cast to webhook format
   */
  private convertCastToWebhookFormat(castData: CastData): any {
    return {
      hash: castData.castHash,
      timestamp: castData.timestamp,
      text: castData.text || '',
      thread_hash: castData.castHash,
      parent_hash: null,
      parent_url: null,
      root_parent_url: null,
      author: {
        object: 'user',
        fid: castData.author.fid,
        username: castData.author.username,
        display_name: castData.author.username,
        pfp_url: castData.author.pfp_url,
        custody_address: '',
        profile: {},
        follower_count: 0,
        following_count: 0,
        verifications: [],
        power_badge: false,
      },
      embeds: castData.embeds || [],
      reactions: {
        likes_count: castData.reactions?.likes_count || 0,
        recasts_count: castData.reactions?.recasts_count || 0,
        likes: castData.reactions?.likes || [],
        recasts: castData.reactions?.recasts || [],
      },
      replies: {
        count: castData.replies?.count || 0,
      },
      mentioned_profiles: [],
      mentioned_profiles_ranges: [],
      mentioned_channels: [],
      mentioned_channels_ranges: [],
    };
  }

  /**
   * Format date in Chile time for logging
   */
  private formatChileTime(utcDate: Date): string {
    const chileDate = new Date(
      utcDate.getTime() + this.CHILE_OFFSET_HOURS * 60 * 60 * 1000,
    );
    return `${chileDate.toISOString().replace('T', ' ').substring(0, 19)} Chile time`;
  }
}
