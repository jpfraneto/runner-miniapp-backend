import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { SocialService } from '../../../core/farcaster/services/social.service';

interface CastAuthor {
  fid: number;
  username: string;
  pfp_url: string;
}

interface CastData {
  castHash: string;
  author: CastAuthor;
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

interface ApiResponse {
  casts: any[];
  next?: {
    cursor: string;
  };
}

@Injectable()
export class CastFetchingService implements OnModuleInit {
  private readonly logger = new Logger(CastFetchingService.name);

  constructor(private readonly socialService: SocialService) {}
  private readonly API_KEY =
    process.env.NEYNAR_API_KEY || 'E0E2E9A8-5824-45E7-BBBA-0B88720F056C';
  private readonly CHANNEL_ID = 'running';
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly OUTPUT_FILE = path.join(this.DATA_DIR, 'running_casts.json');
  private readonly DELAY_MS = 500;

  async onModuleInit() {
    this.logger.log(
      '🚀 Cast Fetching Service initialized - fetching new casts on startup',
    );
    //await this.ensureDataDirectory();
    //await this.scrapeNewCasts();
  }

  private async ensureDataDirectory(): Promise<void> {
    try {
      await fs.access(this.DATA_DIR);
    } catch {
      await fs.mkdir(this.DATA_DIR, { recursive: true });
      this.logger.log(`📁 Created data directory: ${this.DATA_DIR}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchCasts(cursor?: string): Promise<ApiResponse> {
    const url = `https://api.neynar.com/v2/farcaster/feed/channels/?members_only=true&limit=100&channel_ids=${this.CHANNEL_ID}${
      cursor ? `&cursor=${cursor}` : ''
    }`;

    const options = {
      method: 'GET',
      headers: {
        'x-api-key': this.API_KEY,
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
      this.logger.error('Error fetching casts:', error);
      throw error;
    }
  }

  private extractCastData(cast: any): CastData {
    return {
      castHash: cast.hash,
      author: {
        fid: cast.author.fid,
        username: cast.author.username,
        pfp_url: cast.author.pfp_url,
      },
      text: cast.text,
      timestamp: cast.timestamp,
      embeds: cast.embeds || [],
      reactions: {
        likes_count: cast.reactions.likes_count,
        recasts_count: cast.reactions.recasts_count,
        likes: cast.reactions.likes || [],
        recasts: cast.reactions.recasts || [],
      },
      replies: {
        count: cast.replies.count,
      },
    };
  }

  private async loadExistingCasts(): Promise<CastData[]> {
    try {
      await fs.access(this.OUTPUT_FILE);
      const existingData = JSON.parse(
        await fs.readFile(this.OUTPUT_FILE, 'utf8'),
      );
      this.logger.log(
        `📖 Loaded ${existingData.length} existing casts from file`,
      );
      return existingData;
    } catch (error) {
      this.logger.log('📄 No existing casts file found, starting fresh');
      return [];
    }
  }

  private getMostRecentTimestamp(casts: CastData[]): string | null {
    if (casts.length === 0) return null;

    const timestamps = casts.map((cast) => cast.timestamp);
    const sortedTimestamps = timestamps.sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );

    return sortedTimestamps[0];
  }

  async scrapeNewCasts(): Promise<{ newCasts: number; totalCasts: number }> {
    this.logger.log(
      '🚀 Starting to fetch new casts from the running channel...',
    );

    const existingCasts = await this.loadExistingCasts();
    const mostRecentTimestamp = this.getMostRecentTimestamp(existingCasts);

    if (mostRecentTimestamp) {
      this.logger.log(
        `📅 Most recent existing cast: ${new Date(mostRecentTimestamp).toISOString()}`,
      );
    } else {
      this.logger.log('📅 No existing casts found, will fetch all casts');
    }

    const newCasts: CastData[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    let totalNewCasts = 0;
    let shouldStop = false;

    try {
      do {
        pageCount++;
        this.logger.log(
          `📄 Fetching page ${pageCount}${
            cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''
          }...`,
        );

        const response = await this.fetchCasts(cursor);

        if (response.casts && response.casts.length > 0) {
          const extractedCasts = response.casts.map((cast) =>
            this.extractCastData(cast),
          );

          for (const cast of extractedCasts) {
            if (
              existingCasts.some(
                (existing) => existing.castHash === cast.castHash,
              )
            ) {
              this.logger.log(
                `🛑 Found existing cast: ${cast.castHash.substring(0, 20)}..., stopping fetch`,
              );
              shouldStop = true;
              break;
            }

            newCasts.push(cast);
            totalNewCasts++;
          }

          if (extractedCasts.length > 0) {
            this.logger.log(
              `✅ Processed ${extractedCasts.length} casts, found ${totalNewCasts} new ones`,
            );
          }

          if (shouldStop) {
            this.logger.log('🛑 Reached older casts, stopping fetch');
            break;
          }
        }

        cursor = response.next?.cursor;

        if (cursor && !shouldStop) {
          await this.sleep(this.DELAY_MS);
        }
      } while (cursor && !shouldStop);

      if (newCasts.length === 0) {
        this.logger.log('✅ No new casts found since last run!');
        return { newCasts: 0, totalCasts: existingCasts.length };
      }

      // Merge new casts with existing ones (newest first)
      const allCasts = [...newCasts, ...existingCasts];

      // Sort by timestamp (newest first)
      allCasts.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      // Save all casts to JSON file
      const jsonData = JSON.stringify(allCasts, null, 2);
      await fs.writeFile(this.OUTPUT_FILE, jsonData, 'utf8');

      this.logger.log('🎉 Fetching completed successfully!');
      this.logger.log(`📊 SUMMARY:`);
      this.logger.log(`   • New casts fetched: ${totalNewCasts}`);
      this.logger.log(`   • Total pages processed: ${pageCount}`);
      this.logger.log(`   • Total casts in file: ${allCasts.length}`);
      this.logger.log(`   • Data saved to: ${this.OUTPUT_FILE}`);

      return { newCasts: totalNewCasts, totalCasts: allCasts.length };
    } catch (error) {
      this.logger.error('❌ Error during fetching:', error);

      // Save partial data if any was collected
      if (newCasts.length > 0) {
        const partialFile = path.join(
          this.DATA_DIR,
          'running_casts_partial_new.json',
        );
        await fs.writeFile(
          partialFile,
          JSON.stringify(newCasts, null, 2),
          'utf8',
        );
        this.logger.log(
          `💾 Partial new data saved to: ${partialFile} (${newCasts.length} casts)`,
        );
      }
      throw error;
    }
  }

  async getCastsData(): Promise<CastData[]> {
    return await this.loadExistingCasts();
  }

  /**
   * Process stored casts through the same pipeline used for webhooks
   * This enables seeding the database with historical running data
   */
  async processStoredCasts(
    limit?: number,
  ): Promise<{ processed: number; skipped: number; errors: number }> {
    this.logger.log('🌱 Starting to process stored casts for seeding...');

    const storedCasts = await this.loadExistingCasts();
    const castsToProcess = limit ? storedCasts.slice(0, limit) : storedCasts;

    this.logger.log(`📊 Processing ${castsToProcess.length} stored casts`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const [index, castData] of castsToProcess.entries()) {
      try {
        this.logger.log(
          `🔄 Processing cast ${index + 1}/${castsToProcess.length}: ${castData.castHash.substring(0, 20)}...`,
        );

        // Convert the stored cast format to webhook format
        const webhookData = this.convertStoredCastToWebhookFormat(castData);

        // Process through the same pipeline as webhook
        const result = await this.socialService.processCastWebhook(
          {
            created_at: new Date(castData.timestamp).getTime(),
            type: 'cast.created',
            data: webhookData,
          },
          'seed',
        );

        if (result.processed) {
          processed++;
          this.logger.log(
            `✅ Successfully processed cast: ${castData.castHash.substring(0, 20)}...`,
          );
        } else {
          skipped++;
          this.logger.log(
            `⏭️  Skipped cast (already processed or no workout): ${castData.castHash.substring(0, 20)}...`,
          );
        }

        // Add small delay to avoid overwhelming the system
        await this.sleep(100);
      } catch (error) {
        errors++;
        this.logger.error(
          `❌ Error processing cast ${castData.castHash.substring(0, 20)}...:`,
          error.message,
        );
      }
    }

    this.logger.log('🌱 Seeding completed!');
    this.logger.log(`📊 SEEDING SUMMARY:`);
    this.logger.log(`   • Processed: ${processed}`);
    this.logger.log(`   • Skipped: ${skipped}`);
    this.logger.log(`   • Errors: ${errors}`);

    return { processed, skipped, errors };
  }

  /**
   * Convert stored cast format to webhook format expected by SocialService
   */
  private convertStoredCastToWebhookFormat(castData: CastData): any {
    return {
      hash: castData.castHash,
      timestamp: castData.timestamp,
      text: castData.text || '',
      thread_hash: castData.castHash, // Use castHash as thread_hash for stored casts
      parent_hash: null, // Most stored casts are root casts
      parent_url: null,
      root_parent_url: null,
      author: {
        object: 'user',
        fid: castData.author.fid,
        username: castData.author.username,
        display_name: castData.author.username, // Use username as display_name if not available
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
}
