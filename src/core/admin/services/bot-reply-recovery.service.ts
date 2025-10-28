import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getConfig } from '../../../security/config';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import { SocialService } from '../../farcaster/services/social.service';
import NeynarService from '../../../utils/neynar';

interface BotReply {
  hash: string;
  parent_hash: string;
  parent_author: {
    fid: number;
  };
  text: string;
  timestamp: string;
  embeds: any[];
}

interface BotReplyResponse {
  casts: BotReply[];
  next?: {
    cursor: string;
  };
}

interface RecoveryResult {
  totalRepliesFetched: number;
  parentCastsFound: number;
  parentCastsInDatabase: number;
  missingParentCasts: number;
  parentCastsProcessed: number;
  errors: number;
  missingCastHashes: string[];
}

@Injectable()
export class BotReplyRecoveryService {
  private readonly logger = new Logger(BotReplyRecoveryService.name);
  private readonly BOT_FID = 1111387; // runnerbot FID
  private readonly VIEWER_FID = 16098; // Your FID for viewing context
  private readonly DELAY_MS = 1000; // 1 second delay between API calls to avoid rate limits
  private readonly BATCH_SIZE = 25; // Neynar's default batch size

  constructor(
    @InjectRepository(RunningSession)
    private readonly runningSessionRepo: Repository<RunningSession>,
    private readonly socialService: SocialService,
    private readonly neynarService: NeynarService,
  ) {}

  /**
   * Recover missed runs by fetching all bot replies and processing missing parent casts
   */
  async recoverFromBotReplies(): Promise<RecoveryResult> {
    this.logger.log('🤖 Starting bot reply recovery process...');

    const result: RecoveryResult = {
      totalRepliesFetched: 0,
      parentCastsFound: 0,
      parentCastsInDatabase: 0,
      missingParentCasts: 0,
      parentCastsProcessed: 0,
      errors: 0,
      missingCastHashes: [],
    };

    try {
      // Step 1: Fetch all bot replies
      this.logger.log('📡 Fetching all bot replies from Neynar...');
      const allReplies = await this.fetchAllBotReplies();
      result.totalRepliesFetched = allReplies.length;
      this.logger.log(`✅ Fetched ${allReplies.length} bot replies`);

      // Step 2: Extract parent cast hashes
      this.logger.log('🔍 Extracting parent cast hashes...');
      const parentCastHashes = this.extractParentCastHashes(allReplies);
      result.parentCastsFound = parentCastHashes.length;
      this.logger.log(`📊 Found ${parentCastHashes.length} unique parent casts`);

      // Step 3: Check which parent casts are missing from database
      this.logger.log('🔎 Checking database for missing parent casts...');
      const { existing, missing } = await this.checkMissingParentCasts(
        parentCastHashes,
      );
      result.parentCastsInDatabase = existing.length;
      result.missingParentCasts = missing.length;
      result.missingCastHashes = missing;

      this.logger.log(`📊 Database check results:`);
      this.logger.log(`   • Already in database: ${existing.length}`);
      this.logger.log(`   • Missing from database: ${missing.length}`);

      if (missing.length === 0) {
        this.logger.log('🎉 No missing parent casts found! All runs are already in the database.');
        return result;
      }

      // Step 4: Fetch and process missing parent casts
      this.logger.log(`🚀 Processing ${missing.length} missing parent casts...`);
      const processedCount = await this.processMissingParentCasts(missing);
      result.parentCastsProcessed = processedCount;

      this.logger.log('🎉 Bot reply recovery completed successfully!');
      this.logger.log('📊 RECOVERY SUMMARY:');
      this.logger.log(`   • Bot replies fetched: ${result.totalRepliesFetched}`);
      this.logger.log(`   • Parent casts found: ${result.parentCastsFound}`);
      this.logger.log(`   • Already in database: ${result.parentCastsInDatabase}`);
      this.logger.log(`   • Missing from database: ${result.missingParentCasts}`);
      this.logger.log(`   • Parent casts processed: ${result.parentCastsProcessed}`);
      this.logger.log(`   • Errors: ${result.errors}`);

      return result;
    } catch (error) {
      this.logger.error('❌ Bot reply recovery failed:', error);
      result.errors++;
      throw error;
    }
  }

  /**
   * Fetch all bot replies from Neynar API in batches
   */
  private async fetchAllBotReplies(): Promise<BotReply[]> {
    const allReplies: BotReply[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    try {
      do {
        pageCount++;
        this.logger.log(
          `📄 Fetching bot replies page ${pageCount}${
            cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''
          }...`,
        );

        const response = await this.fetchBotRepliesBatch(cursor);

        if (response.casts && response.casts.length > 0) {
          allReplies.push(...response.casts);
          this.logger.log(
            `✅ Page ${pageCount}: ${response.casts.length} replies (total: ${allReplies.length})`,
          );
        }

        cursor = response.next?.cursor;

        // Rate limiting: wait between requests
        if (cursor) {
          this.logger.log(`⏳ Waiting ${this.DELAY_MS}ms to avoid rate limits...`);
          await this.sleep(this.DELAY_MS);
        }
      } while (cursor);

      this.logger.log(`📋 Completed fetching ${allReplies.length} bot replies across ${pageCount} pages`);
      return allReplies;
    } catch (error) {
      this.logger.error('❌ Error fetching bot replies:', error);
      throw error;
    }
  }

  /**
   * Fetch a single batch of bot replies from Neynar
   */
  private async fetchBotRepliesBatch(cursor?: string): Promise<BotReplyResponse> {
    const appConfig = getConfig();
    
    let url = `https://api.neynar.com/v2/farcaster/feed/user/replies_and_recasts/?filter=replies&limit=${this.BATCH_SIZE}&fid=${this.BOT_FID}&viewer_fid=${this.VIEWER_FID}`;
    
    if (cursor) {
      url += `&cursor=${cursor}`;
    }

    const options = {
      method: 'GET',
      headers: {
        'x-api-key': appConfig.neynar.apiKey,
        'x-neynar-experimental': 'false',
      },
    };

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      this.logger.error('Error fetching bot replies batch:', error);
      throw error;
    }
  }

  /**
   * Extract unique parent cast hashes from bot replies
   */
  private extractParentCastHashes(replies: BotReply[]): string[] {
    const parentHashes = new Set<string>();

    replies.forEach((reply) => {
      if (reply.parent_hash) {
        parentHashes.add(reply.parent_hash);
      }
    });

    return Array.from(parentHashes);
  }

  /**
   * Check which parent casts are missing from the database
   */
  private async checkMissingParentCasts(
    parentCastHashes: string[],
  ): Promise<{ existing: string[]; missing: string[] }> {
    this.logger.log(`🔍 Checking ${parentCastHashes.length} parent casts against database...`);

    const existingHashes = new Set<string>();

    // Check in batches to avoid memory issues
    const batchSize = 1000;
    for (let i = 0; i < parentCastHashes.length; i += batchSize) {
      const batch = parentCastHashes.slice(i, i + batchSize);
      
      const existingSessions = await this.runningSessionRepo.find({
        where: batch.map(hash => ({ castHash: hash })),
        select: ['castHash'],
      });

      existingSessions.forEach(session => {
        existingHashes.add(session.castHash);
      });

      this.logger.log(
        `📊 Batch ${Math.floor(i / batchSize) + 1}: ${existingSessions.length}/${batch.length} found in database`,
      );
    }

    const existing = Array.from(existingHashes);
    const missing = parentCastHashes.filter(hash => !existingHashes.has(hash));

    return { existing, missing };
  }

  /**
   * Process missing parent casts by fetching them and running through the pipeline
   */
  private async processMissingParentCasts(missingHashes: string[]): Promise<number> {
    let processedCount = 0;
    let errors = 0;

    this.logger.log(`🚀 Processing ${missingHashes.length} missing parent casts...`);

    for (const [index, castHash] of missingHashes.entries()) {
      try {
        this.logger.log(
          `🔄 Processing missing cast ${index + 1}/${missingHashes.length}: ${castHash.substring(0, 20)}...`,
        );

        // Fetch the cast from Neynar
        const cast = await this.neynarService.getCastByHash(castHash);

        // Convert to webhook format and process
        const webhookData = {
          created_at: new Date(cast.timestamp).getTime(),
          type: 'cast.created',
          data: {
            hash: cast.hash,
            timestamp: cast.timestamp,
            text: cast.text || '',
            thread_hash: cast.hash,
            parent_hash: cast.parent_hash || null,
            parent_url: cast.parent_url || null,
            root_parent_url: cast.root_parent_url || null,
            author: {
              object: 'user',
              fid: cast.author.fid,
              username: cast.author.username,
              display_name: cast.author.display_name || cast.author.username,
              pfp_url: cast.author.pfp_url,
              custody_address: cast.author.custody_address || '',
              profile: cast.author.profile || {},
              follower_count: cast.author.follower_count || 0,
              following_count: cast.author.following_count || 0,
              verifications: cast.author.verifications || [],
              power_badge: cast.author.power_badge || false,
            },
            embeds: (cast.embeds || []).map(embed => ({
              url: (embed as any).url || '',
              metadata: (embed as any).metadata || {},
            })),
            reactions: {
              likes_count: 0,
              recasts_count: 0,
              likes: [],
              recasts: [],
            },
            replies: {
              count: 0,
            },
            mentioned_profiles: [],
            mentioned_profiles_ranges: [],
            mentioned_channels: [],
            mentioned_channels_ranges: [],
          },
        };

        // Process through the social service pipeline
        const result = await this.socialService.processCastWebhook(webhookData, 'bot-recovery');

        if (result.processed && result.isWorkoutImage) {
          processedCount++;
          this.logger.log(
            `✅ Successfully processed missing cast: ${castHash.substring(0, 20)}... (${result.run?.distanceMeters || 0}m)`,
          );
        } else {
          this.logger.log(
            `⏭️ Cast processed but no workout detected: ${castHash.substring(0, 20)}...`,
          );
        }

        // Rate limiting: small delay between processing
        if (index % 5 === 0) {
          await this.sleep(200);
        }
      } catch (error) {
        errors++;
        this.logger.error(
          `❌ Error processing missing cast ${castHash.substring(0, 20)}...:`,
          error.message,
        );
      }
    }

    this.logger.log(
      `🎉 Completed processing missing casts: ${processedCount} processed successfully, ${errors} errors`,
    );
    return processedCount;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}