// src/core/social/services/cast-fetcher.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';
import { CastProcessorService, FarcasterCastData } from './cast-processor.service';
import { ScreenshotProcessorService } from '../../training/services/screenshot-processor.service';

interface NeynarCastResponse {
  casts: any[];
  next?: {
    cursor: string;
  };
}

@Injectable()
export class CastFetcherService {
  private readonly logger = new Logger(CastFetcherService.name);
  
  private readonly API_KEY = process.env.NEYNAR_API_KEY;
  private readonly CHANNEL_ID = 'running';
  private readonly DELAY_MS = 500; // 0.5 seconds delay between requests

  constructor(
    @InjectRepository(FarcasterCast)
    private readonly farcasterCastRepository: Repository<FarcasterCast>,
    private readonly castProcessorService: CastProcessorService,
    private readonly screenshotProcessorService: ScreenshotProcessorService,
  ) {}

  async fetchAndProcessLatestCasts(): Promise<void> {
    try {
      this.logger.log('🚀 Starting automated cast fetching and processing');
      
      // Get the most recent cast hash from our database
      const lastProcessedCast = await this.farcasterCastRepository.findOne({
        order: { createdAt: 'DESC' },
        select: ['farcasterCastHash'],
      });

      this.logger.log(`📅 Last processed cast: ${lastProcessedCast?.farcasterCastHash || 'none'}`);

      const newCasts = await this.fetchNewCasts(lastProcessedCast?.farcasterCastHash);
      
      if (newCasts.length === 0) {
        this.logger.log('✅ No new casts found since last run');
        return;
      }

      this.logger.log(`📸 Found ${newCasts.length} new casts to process`);

      // Process each cast
      for (const cast of newCasts) {
        await this.processSingleCast(cast);
        
        // Add delay between processing to avoid rate limits
        await this.sleep(this.DELAY_MS);
      }

      this.logger.log('🎉 Automated cast processing completed successfully');
    } catch (error) {
      this.logger.error('❌ Error in automated cast fetching and processing:', error);
      throw error;
    }
  }

  private async fetchNewCasts(lastProcessedHash?: string): Promise<any[]> {
    const newCasts: any[] = [];
    let cursor: string | undefined;
    let shouldStop = false;

    try {
      do {
        this.logger.log(`📄 Fetching casts page${cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''}`);

        const response = await this.fetchCastsFromNeynar(cursor);

        if (response.casts && response.casts.length > 0) {
          for (const cast of response.casts) {
            // If we reach a cast we've already processed, stop
            if (lastProcessedHash && cast.hash === lastProcessedHash) {
              this.logger.log(`🛑 Reached already processed cast: ${cast.hash.substring(0, 20)}...`);
              shouldStop = true;
              break;
            }

            // Only process casts from the last 24 hours
            const castDate = new Date(cast.timestamp);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            if (castDate < twentyFourHoursAgo) {
              this.logger.log(`⏰ Cast is older than 24 hours, stopping: ${cast.hash.substring(0, 20)}...`);
              shouldStop = true;
              break;
            }

            newCasts.push(cast);
          }
        }

        cursor = response.next?.cursor;

        if (cursor && !shouldStop) {
          await this.sleep(this.DELAY_MS);
        }
      } while (cursor && !shouldStop);

      return newCasts;
    } catch (error) {
      this.logger.error('❌ Error fetching new casts:', error);
      throw error;
    }
  }

  private async fetchCastsFromNeynar(cursor?: string): Promise<NeynarCastResponse> {
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
      this.logger.error('❌ Error fetching casts from Neynar:', error);
      throw error;
    }
  }

  private async processSingleCast(cast: any): Promise<void> {
    try {
      this.logger.log(`🔄 Processing cast: ${cast.hash.substring(0, 20)}... by @${cast.author.username}`);

      // Check if cast already exists in database
      const existingCast = await this.farcasterCastRepository.findOne({
        where: { farcasterCastHash: cast.hash },
      });

      if (existingCast) {
        this.logger.log(`⏭️ Cast already exists in database: ${cast.hash.substring(0, 20)}...`);
        return;
      }

      // Convert cast to FarcasterCastData format
      const castData: FarcasterCastData = this.convertToFarcasterCastData(cast);

      // Check if cast has images
      const hasImages = castData.embeds.some(
        (embed) =>
          embed.url &&
          (embed.url.includes('imagedelivery.net') ||
            embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
            (embed.metadata &&
              embed.metadata.content_type &&
              embed.metadata.content_type.startsWith('image/'))),
      );

      if (!hasImages) {
        this.logger.log(`📝 Cast has no images, skipping: ${cast.hash.substring(0, 20)}...`);
        return;
      }

      // Process the cast using the existing cast processor
      const result = await this.castProcessorService.processCast(castData);

      this.logger.log(`✅ Successfully processed cast: ${cast.hash.substring(0, 20)}... (confidence: ${Math.round((result.confidence || 0) * 100)}%)`);
    } catch (error) {
      this.logger.error(`❌ Error processing cast ${cast.hash.substring(0, 20)}...:`, error);
      // Continue processing other casts even if one fails
    }
  }

  private convertToFarcasterCastData(cast: any): FarcasterCastData {
    return {
      hash: cast.hash,
      timestamp: cast.timestamp,
      text: cast.text,
      thread_hash: cast.thread_hash,
      parent_hash: cast.parent_hash,
      parent_url: cast.parent_url,
      root_parent_url: cast.root_parent_url,
      author: {
        object: cast.author.object,
        fid: cast.author.fid,
        username: cast.author.username,
        display_name: cast.author.display_name,
        pfp_url: cast.author.pfp_url,
        custody_address: cast.author.custody_address,
        profile: cast.author.profile,
        follower_count: cast.author.follower_count,
        following_count: cast.author.following_count,
        verifications: cast.author.verifications,
        power_badge: cast.author.power_badge,
        score: cast.author.score,
      },
      app: cast.app,
      channel: cast.channel,
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
      mentioned_profiles: cast.mentioned_profiles || [],
      mentioned_profiles_ranges: cast.mentioned_profiles_ranges || [],
      mentioned_channels: cast.mentioned_channels || [],
      mentioned_channels_ranges: cast.mentioned_channels_ranges || [],
      author_channel_context: cast.author_channel_context,
      event_timestamp: cast.event_timestamp,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<{ status: string; lastRun?: Date }> {
    try {
      // Check if we can connect to Neynar API
      const testUrl = `https://api.neynar.com/v2/farcaster/feed/channels/?members_only=true&limit=1&channel_ids=${this.CHANNEL_ID}`;
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'x-api-key': this.API_KEY,
          'x-neynar-experimental': 'false',
        },
      });

      if (!response.ok) {
        throw new Error(`Neynar API error: ${response.status}`);
      }

      // Get last processed cast timestamp
      const lastProcessedCast = await this.farcasterCastRepository.findOne({
        order: { createdAt: 'DESC' },
        select: ['createdAt'],
      });

      return {
        status: 'healthy',
        lastRun: lastProcessedCast?.createdAt,
      };
    } catch (error) {
      this.logger.error('❌ Health check failed:', error);
      return {
        status: 'unhealthy',
      };
    }
  }
}