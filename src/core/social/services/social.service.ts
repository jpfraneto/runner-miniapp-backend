// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
    }, this.CACHE_CLEANUP_INTERVAL);
  }

  /**
   * Check if a cast has already been processed
   */
  private async isCastAlreadyProcessed(castHash: string): Promise<boolean> {
    // First check in-memory cache for quick lookup
    if (this.processedCastsCache.has(castHash)) {
      console.log(
        `🔍 Cast ${castHash} found in memory cache - already processed`,
      );
      this.duplicateDetectionStats.duplicatesFromCache++;
      this.duplicateDetectionStats.duplicatesDetected++;
      this.duplicateDetectionStats.lastDuplicateDetected = new Date();
      return true;
    }

    // Check database for historical records
    const existingCast = await this.farcasterCastRepository.findOne({
      where: { farcasterCastHash: castHash },
    });

    if (existingCast) {
      console.log(`🔍 Cast ${castHash} found in database - already processed`);
      // Add to cache for future quick lookups
      this.processedCastsCache.add(castHash);
      this.duplicateDetectionStats.duplicatesFromDb++;
      this.duplicateDetectionStats.duplicatesDetected++;
      this.duplicateDetectionStats.lastDuplicateDetected = new Date();
      return true;
    }

    console.log(`✅ Cast ${castHash} is new - proceeding with processing`);
    return false;
  }

  /**
   * Mark a cast as processed
   */
  private markCastAsProcessed(castHash: string) {
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
      const alreadyProcessed = await this.isCastAlreadyProcessed(castHash);
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

      // Mark as currently processing AND processed to prevent all race conditions
      this.currentlyProcessingCache.add(castHash);
      this.markCastAsProcessed(castHash);

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

      // Clean up currently processing cache
      this.currentlyProcessingCache.delete(castHash);

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
