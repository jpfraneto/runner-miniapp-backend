// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Models
import { User } from '../../../models';

// Services
import { CastProcessorService } from './cast-processor.service';

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
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly castProcessorService: CastProcessorService,
  ) {}

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
  async processCastWebhook(webhookData: any): Promise<any> {
    try {
      console.log('📨 Processing Farcaster cast webhook');

      // Extract cast data from webhook
      const castData = this.extractCastDataFromWebhook(webhookData);

      if (!castData) {
        console.log('❌ Invalid webhook data format');
        return { success: false, error: 'Invalid webhook data format' };
      }

      // Process the cast
      const result = await this.castProcessorService.processCast(castData);
      const replyHash = await this.castProcessorService.replyToCast(
        castData,
        result,
      );
      console.log('🔍 THE BOT REPLIED WITH HASH:', replyHash);

      return {
        success: true,
        processed: result.isWorkoutImage && result.confidence > 0.3,
        confidence: result.confidence,
        isWorkoutImage: result.isWorkoutImage,
        message: result.isWorkoutImage
          ? 'Workout detected and saved'
          : 'No workout detected',
        replyHash: replyHash,
      };
    } catch (error) {
      console.error('❌ Error processing cast webhook:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract cast data from webhook payload
   */
  public extractCastDataFromWebhook(webhookData: any): any {
    try {
      // Handle different webhook formats from Neynar
      if (webhookData.cast) {
        // Single cast format
        return {
          castHash: webhookData.cast.hash,
          timestamp: webhookData.cast.timestamp,
          text: webhookData.cast.text,
          author: {
            fid: webhookData.cast.author.fid,
            username: webhookData.cast.author.username,
            pfp_url: webhookData.cast.author.pfp_url,
          },
          embeds: webhookData.cast.embeds || [],
          reactions: {
            likes_count: webhookData.cast.reactions?.likes?.length || 0,
            recasts_count: webhookData.cast.reactions?.recasts?.length || 0,
            likes: webhookData.cast.reactions?.likes || [],
            recasts: webhookData.cast.reactions?.recasts || [],
          },
          replies: {
            count: webhookData.cast.replies?.count || 0,
          },
        };
      } else if (webhookData.casts && Array.isArray(webhookData.casts)) {
        // Multiple casts format - process the first one
        const cast = webhookData.casts[0];
        return {
          castHash: cast.hash,
          timestamp: cast.timestamp,
          text: cast.text,
          author: {
            fid: cast.author.fid,
            username: cast.author.username,
            pfp_url: cast.author.pfp_url,
          },
          embeds: cast.embeds || [],
          reactions: {
            likes_count: cast.reactions?.likes?.length || 0,
            recasts_count: cast.reactions?.recasts?.length || 0,
            likes: cast.reactions?.likes || [],
            recasts: cast.reactions?.recasts || [],
          },
          replies: {
            count: cast.replies?.count || 0,
          },
        };
      } else {
        console.error('❌ Unknown webhook format:', webhookData);
        return null;
      }
    } catch (error) {
      console.error('❌ Error extracting cast data:', error);
      return null;
    }
  }

  /**
   * Get webhook processing health status
   */
  async getWebhookHealth(): Promise<any> {
    try {
      const castProcessorHealth = await this.castProcessorService.healthCheck();

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          castProcessor: castProcessorHealth,
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
