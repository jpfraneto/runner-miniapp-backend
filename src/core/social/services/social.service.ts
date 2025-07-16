// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessThan } from 'typeorm';

// Models
import { User } from '../../../models';
import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';

// Services
import {
  CastProcessorService,
  FarcasterCastData,
} from './cast-processor.service';

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
    @InjectRepository(FarcasterCast)
    private readonly farcasterCastRepository: Repository<FarcasterCast>,
    private readonly castProcessorService: CastProcessorService,
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
      const staleRecords = await this.farcasterCastRepository.find({
        where: {
          imageUrl: 'PROCESSING_PLACEHOLDER',
          createdAt: LessThan(oneHourAgo),
        },
      });

      if (staleRecords.length > 0) {
        console.log(
          `🧹 Cleaning up ${staleRecords.length} stale processing records`,
        );
        await this.farcasterCastRepository.remove(staleRecords);
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

    // Use database transaction to atomically check and mark as processing
    const queryRunner =
      this.farcasterCastRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if cast already exists in database
      const existingCast = await queryRunner.manager.findOne(FarcasterCast, {
        where: { farcasterCastHash: castHash },
      });

      if (existingCast) {
        console.log(
          `🔍 Cast ${castHash} found in database - already processed`,
        );
        // Add to cache for future quick lookups
        this.processedCastsCache.add(castHash);
        this.duplicateDetectionStats.duplicatesFromDb++;
        this.duplicateDetectionStats.duplicatesDetected++;
        this.duplicateDetectionStats.lastDuplicateDetected = new Date();
        await queryRunner.rollbackTransaction();
        return { alreadyProcessed: true, isNewlyMarked: false };
      }

      // Atomically insert a placeholder record to mark this cast as being processed
      // This prevents race conditions where multiple webhooks try to process the same cast
      const placeholderCast = new FarcasterCast();
      placeholderCast.farcasterCastHash = castHash;
      placeholderCast.userId = null; // Placeholder value - nullable to avoid foreign key constraint
      placeholderCast.imageUrl = 'PROCESSING_PLACEHOLDER'; // Mark as placeholder
      placeholderCast.caption = 'PROCESSING_PLACEHOLDER'; // Mark as placeholder

      await queryRunner.manager.save(FarcasterCast, placeholderCast);
      await queryRunner.commitTransaction();

      console.log(
        `✅ Cast ${castHash} is new - atomically marked as processing`,
      );
      return { alreadyProcessed: false, isNewlyMarked: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // If we get a duplicate key error, it means another process already inserted this cast
      if (
        error.code === 'ER_DUP_ENTRY' ||
        error.message.includes('duplicate key') ||
        error.message.includes('UNIQUE constraint failed')
      ) {
        console.log(
          `🔍 Cast ${castHash} was inserted by another process - already being processed`,
        );
        this.processedCastsCache.add(castHash);
        this.duplicateDetectionStats.duplicatesDetected++;
        this.duplicateDetectionStats.lastDuplicateDetected = new Date();
        return { alreadyProcessed: true, isNewlyMarked: false };
      }

      console.error(
        `❌ Database error during duplicate check for cast ${castHash}:`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Mark a cast as fully processed (update the placeholder record)
   */
  private async markCastAsFullyProcessed(
    castHash: string,
    castData: any,
    result: any,
  ): Promise<void> {
    try {
      // Update the placeholder record with actual cast data
      await this.farcasterCastRepository.update(
        { farcasterCastHash: castHash },
        {
          userId: castData.author.fid,
          imageUrl: `Processed cast from FID ${castData.author.fid}`,
          caption: castData.text || 'Processed workout cast',
        },
      );

      this.processedCastsCache.add(castHash);
      console.log(`📝 Marked cast ${castHash} as fully processed in database`);
    } catch (error) {
      console.error(`❌ Error marking cast ${castHash} as processed:`, error);
    }
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
  async processCastWebhook(webhookData: WebhookData): Promise<any> {
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
          processed: false,
          concurrent: true,
          message:
            'Cast is currently being processed - concurrent webhook ignored',
          castHash: castHash,
        };
      }

      // **DEDUPLICATION CHECK** - Prevent processing the same cast multiple times
      console.log(
        `🔍 Checking if cast ${castHash} has already been processed...`,
      );
      const { alreadyProcessed, isNewlyMarked } =
        await this.isCastAlreadyProcessed(castHash);

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
        };
      }

      console.log(`✅ Cast ${castHash} is new and ready for processing`);

      // Mark as currently processing to prevent race conditions
      this.currentlyProcessingCache.add(castHash);
      console.log(`🔒 Added cast ${castHash} to currently processing cache`);

      // Process the cast
      console.log(`🚀 Processing new cast: ${castHash}`);
      const result = await this.castProcessorService.processCast(thisCast);

      // Only reply if we detected a workout with sufficient confidence AND we haven't replied before
      let replyHash = null;
      if (result.isWorkoutImage && result.confidence > 0.3) {
        // Check if we've already replied BEFORE marking as replied (atomic check-and-set)
        if (this.hasAlreadyReplied(castHash)) {
          console.log(
            `⚠️  DUPLICATE REPLY PREVENTED: Already replied to cast ${castHash}`,
          );
        } else {
          console.log(
            `💬 Workout detected with confidence ${result.confidence} - sending reply`,
          );

          // Mark as replied IMMEDIATELY to prevent any race conditions
          this.markAsReplied(castHash);

          try {
            replyHash = await this.castProcessorService.replyToCast(
              thisCast,
              result,
            );
            console.log(
              `🔍 THE BOT REPLIED WITH HASH: ${replyHash?.replyHash || replyHash}`,
            );
          } catch (error) {
            console.error(
              `❌ Failed to send reply to cast ${castHash}:`,
              error,
            );
            // Don't remove from replied cache on failure to prevent infinite retries
            // The cast will remain marked as "replied to" to prevent spam
          }
        }
      } else {
        console.log(
          `📝 No reply sent - not a workout image or low confidence (${result.confidence})`,
        );
      }

      // Mark as fully processed in the database
      console.log(`💾 Marking cast ${castHash} as fully processed in database`);
      await this.markCastAsFullyProcessed(castHash, thisCast, result);

      // Clean up currently processing cache
      this.currentlyProcessingCache.delete(castHash);
      console.log(
        `🔓 Removed cast ${castHash} from currently processing cache`,
      );

      return {
        success: true,
        processed: result.isWorkoutImage && result.confidence > 0.3,
        confidence: result.confidence,
        isWorkoutImage: result.isWorkoutImage,
        message: result.isWorkoutImage
          ? 'Workout detected and saved'
          : 'No workout detected',
        replyHash: replyHash?.replyHash || replyHash,
        castHash: castHash,
        duplicate: false,
      };
    } catch (error) {
      console.error('❌ Error processing cast webhook:', error);
      // Clean up currently processing cache on error too
      if (castHash) {
        this.currentlyProcessingCache.delete(castHash);
        console.log(
          `🔓 Removed cast ${castHash} from currently processing cache due to error`,
        );
      }
      return {
        success: false,
        error: error.message,
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
