// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessThan } from 'typeorm';

// Models
import { User, RunningSession, RunningSessionStatus } from '../../../models';
// Note: FarcasterCast model has been removed
// import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';

// Services
import {
  CastProcessorService,
  CastWorkoutData,
  FarcasterCastData,
} from './cast-processor.service';
import { TrainingService } from '../../training/services/training.service';

// Types
export type WebhookData = {
  created_at: number;
  type: string;
  data: FarcasterCastData;
};

/**
 * Social service for share image generation and community features.
 *
 * This service handles:
 * - Share image generation
 * - Farcaster posts
 * - Community feed
 * - Social interactions
 * - Cast webhook processing
 */
@Injectable()
export class SocialService {
  // In-memory cache for recently processed casts (for quick deduplication)
  private processedCastsCache = new Set<string>();
  // In-memory cache for casts we've already replied to
  private repliedCastsCache = new Set<string>();
  // In-memory cache for casts currently being processed (to prevent concurrent processing)
  private currentlyProcessingCache = new Set<string>();
  private readonly CACHE_SIZE_LIMIT = 10000; // Limit cache size to prevent memory issues
  private readonly CACHE_CLEANUP_INTERVAL = 60000; // Clean up cache every minute

  // Statistics for monitoring duplicate detection
  private duplicateDetectionStats = {
    totalWebhooks: 0,
    duplicatesDetected: 0,
    duplicatesFromCache: 0,
    duplicatesFromDb: 0,
    lastDuplicateDetected: null as Date | null,
    startTime: new Date(),
  };

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
    // Note: FarcasterCast repository removed as model has been deleted
    // @InjectRepository(FarcasterCast)
    // private readonly farcasterCastRepository: Repository<FarcasterCast>,
    private readonly castProcessorService: CastProcessorService,
    private readonly trainingService: TrainingService,
  ) {
    // Start cache cleanup interval
    this.startCacheCleanup();
  }

  /**
   * Start cache cleanup to prevent memory leaks
   */
  private startCacheCleanup() {
    setInterval(() => {
      // Clean up processed casts cache
      if (this.processedCastsCache.size > this.CACHE_SIZE_LIMIT) {
        const cacheArray = Array.from(this.processedCastsCache);
        this.processedCastsCache.clear();
        const recentHalf = cacheArray.slice(cacheArray.length / 2);
        this.processedCastsCache = new Set(recentHalf);
        console.log(
          `🧹 Processed cache cleanup: Reduced from ${cacheArray.length} to ${this.processedCastsCache.size} entries`,
        );
      }

      // Clean up replied casts cache
      if (this.repliedCastsCache.size > this.CACHE_SIZE_LIMIT) {
        const cacheArray = Array.from(this.repliedCastsCache);
        this.repliedCastsCache.clear();
        const recentHalf = cacheArray.slice(cacheArray.length / 2);
        this.repliedCastsCache = new Set(recentHalf);
        console.log(
          `🧹 Replied cache cleanup: Reduced from ${cacheArray.length} to ${this.repliedCastsCache.size} entries`,
        );
      }

      // Clean up currently processing cache (should be small, but clean anyway)
      if (this.currentlyProcessingCache.size > 100) {
        console.log(
          `🧹 Currently processing cache cleanup: Clearing ${this.currentlyProcessingCache.size} entries`,
        );
        this.currentlyProcessingCache.clear();
      }

      // Clean up stale processing records in database (older than 1 hour)
      this.cleanupStaleProcessingRecords();
    }, this.CACHE_CLEANUP_INTERVAL);
  }

  /**
   * Clean up stale processing records in the database
   */
  private async cleanupStaleProcessingRecords(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const staleRecords = await this.runningSessionRepository.find({
        where: {
          status: RunningSessionStatus.PROCESSING,
          createdAt: LessThan(oneHourAgo),
        },
      });
      if (staleRecords.length > 0) {
        console.log(
          `🧹 Cleaning up ${staleRecords.length} stale processing records`,
        );
        // Update them to FAILED status instead of removing them
        await this.runningSessionRepository.update(
          {
            status: RunningSessionStatus.PROCESSING,
            createdAt: LessThan(oneHourAgo),
          },
          { status: RunningSessionStatus.FAILED },
        );
      }
    } catch (error) {
      console.error('❌ Error cleaning up stale processing records:', error);
    }
  }

  /**
   * Check if a cast has already been processed and atomically mark it as processing
   * This method uses database-level locking to ensure true idempotency
   */
  private async isCastAlreadyProcessed(
    castHash: string,
    fid: number,
  ): Promise<{ alreadyProcessed: boolean; isNewlyMarked: boolean }> {
    // First check in-memory cache for quick lookup
    if (this.processedCastsCache.has(castHash)) {
      console.log(
        `🔍 Cast ${castHash} found in memory cache - already processed`,
      );
      this.duplicateDetectionStats.duplicatesFromCache++;
      this.duplicateDetectionStats.duplicatesDetected++;
      this.duplicateDetectionStats.lastDuplicateDetected = new Date();
      return { alreadyProcessed: true, isNewlyMarked: false };
    }

    // Check database for existing running session with this cast hash
    try {
      const existingSession = await this.runningSessionRepository.findOne({
        where: { castHash },
      });

      if (existingSession) {
        // Only consider it already processed if it's COMPLETED or FAILED
        // PROCESSING status means it was created by verify endpoint but not yet processed
        if (
          existingSession.status === RunningSessionStatus.COMPLETED ||
          existingSession.status === RunningSessionStatus.FAILED
        ) {
          console.log(
            `🔍 Cast ${castHash} found in database with status ${existingSession.status} - already processed`,
          );
          this.processedCastsCache.add(castHash);
          this.duplicateDetectionStats.duplicatesFromDb++;
          this.duplicateDetectionStats.duplicatesDetected++;
          this.duplicateDetectionStats.lastDuplicateDetected = new Date();
          return { alreadyProcessed: true, isNewlyMarked: false };
        } else {
          console.log(
            `🔍 Cast ${castHash} found in database with status ${existingSession.status} - needs processing`,
          );
          return { alreadyProcessed: false, isNewlyMarked: false };
        }
      }

      // Try to create new session with PROCESSING status atomically
      // Only create if no session exists
      try {
        await this.trainingService.createInitialRunningSession(
          fid,
          castHash,
          RunningSessionStatus.PROCESSING,
        );
        console.log(
          `✅ Cast ${castHash} is new - created database record with PROCESSING status`,
        );
        return { alreadyProcessed: false, isNewlyMarked: true };
      } catch (error) {
        // If we get a duplicate key error, it means another process already inserted this cast
        if (
          error.code === 'ER_DUP_ENTRY' ||
          error.message.includes('duplicate key') ||
          error.message.includes('UNIQUE constraint failed') ||
          error.message.includes('already exists')
        ) {
          console.log(
            `🔍 Cast ${castHash} was inserted by another process - proceeding with processing`,
          );
          return { alreadyProcessed: false, isNewlyMarked: false };
        }

        // Handle daily limit and user not found errors - these should bubble up to be handled properly
        if (
          (error.status === 400 && error.message?.includes('daily limit')) ||
          (error.status === 404 && error.message?.includes('User with FID'))
        ) {
          console.log(
            `⚠️ Business logic error during session creation for cast ${castHash}: ${error.message}`,
          );
          throw error; // Re-throw to be handled by the main catch block
        }

        console.error(
          `❌ Database error during duplicate check for cast ${castHash}:`,
          error,
        );
        throw error;
      }
    } catch (error) {
      console.error(
        `❌ Error checking cast processing status for ${castHash}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Mark a cast as fully processed (update the placeholder record)
   */
  private async markCastAsFullyProcessed(castHash: string): Promise<void> {
    this.processedCastsCache.add(castHash);
    console.log(`📝 Marked cast ${castHash} as processed in cache`);
  }

  /**
   * Check if we've already replied to a cast
   */
  private hasAlreadyReplied(castHash: string): boolean {
    const alreadyReplied = this.repliedCastsCache.has(castHash);
    if (alreadyReplied) {
      console.log(`💬 Already replied to cast ${castHash} - skipping reply`);
    }
    return alreadyReplied;
  }

  /**
   * Mark a cast as replied to
   */
  private markAsReplied(castHash: string): void {
    this.repliedCastsCache.add(castHash);
    console.log(`💬 Marked cast ${castHash} as replied to`);
  }

  private async removeCastFromDatabase(castHash: string): Promise<void> {
    await this.runningSessionRepository.delete({ castHash });
    console.log(`💾 Removed cast ${castHash} from database`);
  }

  /**
   * Save workout data to the running session and update user stats
   */
  private async saveWorkoutDataToSession(
    castHash: string,
    fid: number,
    workoutData: CastWorkoutData,
    castTimestamp: string,
  ): Promise<void> {
    try {
      console.log('💾 Saving workout data to session', {
        castHash,
        fid,
        workoutData,
      });

      // Find or create user
      let user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        console.log(`👤 Creating new user for FID: ${fid}`);
        user = await this.userRepository.create({
          fid,
        });
      }

      // Update the running session with actual workout data
      const session = await this.runningSessionRepository.findOne({
        where: { castHash },
      });

      if (!session) {
        throw new Error(`Running session with cast hash ${castHash} not found`);
      }

      // Update session with actual workout data
      if (workoutData.distance) {
        session.distanceMeters = Math.round(workoutData.distance * 1000); // Convert km to meters
      }
      if (workoutData.duration) {
        session.duration = Math.round(workoutData.duration);
      }
      if (workoutData.reasoning) {
        session.reasoning = workoutData.reasoning;
      }
      console.log('💾 SAVING WORKOUT DATA TO SESSION', session);
      session.status = RunningSessionStatus.COMPLETED;
      session.createdAt = new Date(castTimestamp);

      await this.runningSessionRepository.save(session);

      // Update user stats
      user.totalRuns = Number(user.totalRuns || 0) + 1;
      user.totalDistance =
        Number(user.totalDistance || 0) + Number(workoutData.distance || 0);
      user.totalTimeMinutes =
        Number(user.totalTimeMinutes || 0) + Number(workoutData.duration || 0);
      user.lastActiveAt = new Date();

      await this.userRepository.save(user);

      console.log(
        '✅ Successfully saved workout data to session and updated user stats',
      );
    } catch (error) {
      console.error('❌ Error saving workout data to session:', error);
      throw error;
    }
  }

  /**
   * Generate share image
   */
  async generateShareImage(fid: number, shareData: any): Promise<any> {
    // TODO: Implement share image generation logic
    return { message: 'Generate share image - to be implemented' };
  }

  /**
   * Post to Farcaster
   */
  async postToFarcaster(fid: number, postData: any): Promise<any> {
    // TODO: Implement Farcaster posting logic
    return { message: 'Post to Farcaster - to be implemented' };
  }

  /**
   * Get community feed
   */
  async getCommunityFeed(fid: number): Promise<any> {
    // TODO: Implement community feed logic
    return { message: 'Get community feed - to be implemented' };
  }

  /**
   * Get user's social activity
   */
  async getSocialActivity(fid: number): Promise<any> {
    // TODO: Implement social activity logic
    return { message: 'Get social activity - to be implemented' };
  }

  /**
   * Process Farcaster cast webhook
   */
  async processCastWebhook(
    webhookData: WebhookData,
    mode: string = 'seed',
  ): Promise<any> {
    let castHash: string | undefined;
    try {
      console.log('📨 Processing Farcaster cast webhook');

      // Track all webhook calls for statistics
      this.duplicateDetectionStats.totalWebhooks++;

      // Extract cast data from webhook
      const thisCast = webhookData.data;
      if (!thisCast) {
        console.log('❌ Invalid webhook data format');
        return { success: false, error: 'Invalid webhook data format' };
      }

      castHash = thisCast.hash;
      if (!castHash) {
        console.log('❌ Cast hash not found in webhook data');
        return { success: false, error: 'Cast hash not found' };
      }

      console.log(`🔍 Processing cast with hash: ${castHash}`);
      console.log(
        `📊 Webhook stats - Total: ${this.duplicateDetectionStats.totalWebhooks}, Duplicates: ${this.duplicateDetectionStats.duplicatesDetected}`,
      );

      // **ROOT CAST FILTER** - Only process root casts (not replies)
      if (thisCast.parent_hash !== null) {
        console.log(
          `📝 Skipping reply cast ${castHash} - only processing root casts (parent_hash: ${thisCast.parent_hash})`,
        );
        return {
          success: true,
          processed: false,
          isReply: true,
          message: 'Reply cast skipped - only processing root casts',
          castHash: castHash,
        };
      }

      console.log(
        `✅ Root cast confirmed ${castHash} - proceeding with processing`,
      );

      // **CONCURRENT PROCESSING CHECK** - Prevent the same cast being processed simultaneously
      if (this.currentlyProcessingCache.has(castHash)) {
        console.log(
          `⚠️  CONCURRENT PROCESSING DETECTED: Cast ${castHash} is already being processed - skipping`,
        );
        return {
          success: true,
          processed: true,
          message:
            'Cast is currently being processed - concurrent webhook ignored',
          castHash: castHash,
        };
      }

      // **DEDUPLICATION CHECK** - Prevent processing the same cast multiple times
      console.log(
        `🔍 Checking if cast ${castHash} has already been processed...`,
      );
      const { alreadyProcessed } = await this.isCastAlreadyProcessed(
        castHash,
        thisCast.author.fid,
      );

      if (alreadyProcessed) {
        console.log(
          `⚠️  DUPLICATE WEBHOOK DETECTED: Cast ${castHash} has already been processed - skipping`,
        );
        return {
          success: true,
          processed: false,
          duplicate: true,
          message:
            'Cast has already been processed - duplicate webhook ignored',
          castHash: castHash,
          run: {
            distanceMeters: 0,
            duration: 0,
          },
        };
      }

      console.log(`✅ Cast ${castHash} is new and ready for processing`);

      // Mark as currently processing to prevent race conditions
      this.currentlyProcessingCache.add(castHash);
      console.log(`🔒 Added cast ${castHash} to currently processing cache`);

      // Process the cast
      console.log(`🚀 Processing new cast: ${castHash}`);
      const result = (await this.castProcessorService.processCast(
        thisCast,
      )) as CastWorkoutData | null;
      console.log('IN HERE, THE RESULT IS', result.isWorkoutImage);

      // Only reply if we detected a workout with sufficient confidence AND we haven't replied before
      if (result.isWorkoutImage) {
        // Check if we've already replied BEFORE marking as replied (atomic check-and-set)
        // Update database status based on processing result
        console.log(`💾 Updating cast ${castHash} status in database`);

        await this.saveWorkoutDataToSession(
          castHash,
          thisCast.author.fid,
          result,
          thisCast.timestamp,
        );

        // Mark as fully processed in cache
        await this.markCastAsFullyProcessed(castHash);

        // Clean up currently processing cache
        this.currentlyProcessingCache.delete(castHash);
        console.log(
          `🔓 Removed cast ${castHash} from currently processing cache`,
        );

        return {
          success: true,
          processed: result.isWorkoutImage,
          isWorkoutImage: result.isWorkoutImage,
          message: result.isWorkoutImage
            ? 'Workout detected and saved'
            : 'No workout detected',
          replyHash: null,
          castHash: castHash,
          duplicate: false,
          run: {
            distanceMeters: result.distance,
            duration: result.duration,
          },
        };
      } else {
        this.removeCastFromDatabase(castHash);
        console.log('REMOVED CAST FROM DATABASE');
        console.log('REMOVED CAST FROM DATABASE');
        console.log('REMOVED CAST FROM DATABASE');
        console.log('REMOVED CAST FROM DATABASE');
        console.log('REMOVED CAST FROM DATABASE');
        console.log(castHash);
        console.log('REMOVED CAST FROM DATABASE');
        console.log('REMOVED CAST FROM DATABASE');
        console.log('REMOVED CAST FROM DATABASE');
        return {
          success: true,
          processed: false,
          message: 'No workout detected',
          castHash: castHash,
        };
      }
    } catch (error) {
      console.error('❌ Error processing cast webhook:', error);

      // Clean up currently processing cache on error
      if (castHash) {
        this.currentlyProcessingCache.delete(castHash);
        console.log(
          `🔓 Removed cast ${castHash} from currently processing cache due to error`,
        );
      }

      // Handle different error types with structured responses
      if (error.status === 400 && error.message?.includes('daily limit')) {
        console.log(
          `❌ Daily limit reached for user - webhook processing failed: ${error.message}`,
        );
        return {
          success: false,
          processed: false,
          error: {
            type: 'DAILY_LIMIT_REACHED',
            message: error.message,
            code: 'DAILY_LIMIT_EXCEEDED',
            statusCode: 400,
          },
          castHash: castHash,
        };
      }

      if (error.status === 404 && error.message?.includes('User with FID')) {
        console.log(
          `❌ User not found - webhook processing failed: ${error.message}`,
        );
        return {
          success: false,
          processed: false,
          error: {
            type: 'USER_NOT_FOUND',
            message: error.message,
            code: 'USER_NOT_EXISTS',
            statusCode: 404,
          },
          castHash: castHash,
        };
      }

      if (error.status === 400 && error.message?.includes('already exists')) {
        console.log(
          `❌ Duplicate session - webhook processing failed: ${error.message}`,
        );
        return {
          success: false,
          processed: false,
          error: {
            type: 'DUPLICATE_SESSION',
            message: error.message,
            code: 'SESSION_EXISTS',
            statusCode: 400,
          },
          castHash: castHash,
        };
      }

      // Update database status to FAILED on error (only if session might exist)
      if (castHash && error.status !== 400) {
        try {
          await this.trainingService.updateRunningSessionStatus(
            castHash,
            RunningSessionStatus.FAILED,
            { error: error.message },
          );
        } catch (updateError) {
          console.error(
            '❌ Failed to update session status to FAILED:',
            updateError,
          );
        }
      }

      // Generic error response
      return {
        success: false,
        processed: false,
        error: {
          type: 'PROCESSING_ERROR',
          message:
            error.message ||
            'An unexpected error occurred while processing the cast',
          code: 'INTERNAL_ERROR',
          statusCode: error.status || 500,
        },
        castHash: castHash,
      };
    }
  }

  /**
   * Get webhook processing health status
   */
  async getWebhookHealth(): Promise<any> {
    try {
      const castProcessorHealth = await this.castProcessorService.healthCheck();

      // Calculate duplicate detection statistics
      const uptimeHours =
        (new Date().getTime() -
          this.duplicateDetectionStats.startTime.getTime()) /
        (1000 * 60 * 60);
      const duplicateRate =
        this.duplicateDetectionStats.totalWebhooks > 0
          ? (
              (this.duplicateDetectionStats.duplicatesDetected /
                this.duplicateDetectionStats.totalWebhooks) *
              100
            ).toFixed(2)
          : '0.00';

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          castProcessor: castProcessorHealth,
        },
        deduplication: {
          processedCacheSize: this.processedCastsCache.size,
          repliedCacheSize: this.repliedCastsCache.size,
          currentlyProcessingCacheSize: this.currentlyProcessingCache.size,
          stats: {
            ...this.duplicateDetectionStats,
            uptimeHours: Math.round(uptimeHours * 100) / 100,
            duplicateRate: `${duplicateRate}%`,
          },
        },
        message: 'Webhook processing system is healthy',
      };
    } catch (error) {
      console.error('❌ Webhook health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        message: 'Webhook processing system is unhealthy',
      };
    }
  }
}
