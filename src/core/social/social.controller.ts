// Dependencies
import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiOperation } from '@nestjs/swagger';

// Services
import { SocialService } from './services/social.service';

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';

/**
 * Social controller for share image generation and community features.
 *
 * This controller handles:
 * - Share image generation
 * - Farcaster posts
 * - Community feed
 * - Social interactions
 */
@ApiTags('social-service')
@Controller('social-service')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  /**
   * Generate share image
   */
  @Post('/share-image')
  @UseGuards(AuthorizationGuard)
  async generateShareImage(
    @Session() session: QuickAuthPayload,
    @Body() shareData: any,
    @Res() res: Response,
  ) {
    try {
      const image = await this.socialService.generateShareImage(
        session.sub,
        shareData,
      );
      return hasResponse(res, image);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'generateShareImage',
        'Unable to generate share image.',
      );
    }
  }

  /**
   * Post to Farcaster
   */
  @Post('/farcaster-post')
  @UseGuards(AuthorizationGuard)
  async postToFarcaster(
    @Session() session: QuickAuthPayload,
    @Body() postData: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.socialService.postToFarcaster(
        session.sub,
        postData,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'postToFarcaster',
        'Unable to post to Farcaster.',
      );
    }
  }

  /**
   * Get community feed
   */
  @Get('/feed')
  @UseGuards(AuthorizationGuard)
  async getCommunityFeed(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const feed = await this.socialService.getCommunityFeed(session.sub);
      return hasResponse(res, feed);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCommunityFeed',
        'Unable to retrieve community feed.',
      );
    }
  }

  /**
   * Get user's social activity
   */
  @Get('/activity')
  @UseGuards(AuthorizationGuard)
  async getSocialActivity(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const activity = await this.socialService.getSocialActivity(session.sub);
      return hasResponse(res, activity);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getSocialActivity',
        'Unable to retrieve social activity.',
      );
    }
  }

  /**
   * Process Farcaster cast webhook (general)
   */
  @Post('/farcaster/cast-webhook')
  @ApiOperation({
    summary: 'Process Farcaster cast webhook',
    description:
      'Receives webhook from Neynar and processes casts for workout detection',
  })
  async getCastWebhook(@Body() webhookData: any, @Res() res: Response) {
    try {
      console.log('📨 Farcaster cast webhook received');
      console.log('📊 Webhook data:', JSON.stringify(webhookData, null, 2));

      const result = await this.socialService.processCastWebhook(webhookData);

      if (result.success) {
        console.log('✅ Webhook processed successfully');
        return hasResponse(res, {
          message: 'Webhook processed successfully',
          result: result,
        });
      } else {
        console.error('❌ Webhook processing failed:', result.error);
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getCastWebhook',
          result.error || 'Failed to process webhook',
        );
      }
    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCastWebhook',
        'Internal server error processing webhook',
      );
    }
  }

  /**
   * Process Farcaster cast webhook with embed URL filtering
   */
  @Post('/farcaster/cast-webhook/embed-filter')
  @ApiOperation({
    summary: 'Process Farcaster cast webhook with embed filtering',
    description:
      'Processes casts that contain specific embed URLs (e.g., running app screenshots)',
  })
  async getCastWebhookWithEmbedFilter(
    @Body() webhookData: any,
    @Res() res: Response,
  ) {
    try {
      console.log('📨 Farcaster cast webhook with embed filter received');

      // Check if the cast contains image embeds
      const castData =
        this.socialService.extractCastDataFromWebhook(webhookData);
      if (!castData) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getCastWebhookWithEmbedFilter',
          'Invalid webhook data format',
        );
      }

      const hasImageEmbeds = castData.embeds.some(
        (embed) =>
          embed.url &&
          (embed.url.includes('imagedelivery.net') ||
            embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
            (embed.metadata &&
              embed.metadata.content_type &&
              embed.metadata.content_type.startsWith('image/'))),
      );

      if (!hasImageEmbeds) {
        console.log('📝 Cast has no image embeds, skipping processing');
        return hasResponse(res, {
          message: 'Cast has no image embeds, skipping processing',
          processed: false,
        });
      }

      const result = await this.socialService.processCastWebhook(webhookData);

      if (result.success) {
        console.log('✅ Webhook processed successfully');
        return hasResponse(res, {
          message: 'Webhook processed successfully',
          result: result,
        });
      } else {
        console.error('❌ Webhook processing failed:', result.error);
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getCastWebhookWithEmbedFilter',
          result.error || 'Failed to process webhook',
        );
      }
    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCastWebhookWithEmbedFilter',
        'Internal server error processing webhook',
      );
    }
  }

  /**
   * Process Farcaster cast webhook for specific users
   */
  @Post('/farcaster/cast-webhook/user-filter')
  @ApiOperation({
    summary: 'Process Farcaster cast webhook for specific users',
    description:
      'Processes casts from specific FIDs (useful for testing with known users)',
  })
  async getCastWebhookForSpecificUsers(
    @Body() webhookData: any,
    @Res() res: Response,
  ) {
    try {
      console.log('📨 Farcaster cast webhook for specific users received');

      // Extract cast data
      const castData =
        this.socialService.extractCastDataFromWebhook(webhookData);
      if (!castData) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getCastWebhookForSpecificUsers',
          'Invalid webhook data format',
        );
      }

      // Define allowed FIDs (you can make this configurable)
      const allowedFids = [194, 1234, 5678]; // Example FIDs

      if (!allowedFids.includes(castData.author.fid)) {
        console.log(
          `📝 Cast from FID ${castData.author.fid} not in allowed list, skipping`,
        );
        return hasResponse(res, {
          message: 'Cast from user not in allowed list, skipping processing',
          processed: false,
          fid: castData.author.fid,
        });
      }

      const result = await this.socialService.processCastWebhook(webhookData);

      if (result.success) {
        console.log('✅ Webhook processed successfully');
        return hasResponse(res, {
          message: 'Webhook processed successfully',
          result: result,
        });
      } else {
        console.error('❌ Webhook processing failed:', result.error);
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getCastWebhookForSpecificUsers',
          result.error || 'Failed to process webhook',
        );
      }
    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCastWebhookForSpecificUsers',
        'Internal server error processing webhook',
      );
    }
  }

  /**
   * Health check for webhook processing
   */
  @Get('/farcaster/webhook-health')
  @ApiOperation({
    summary: 'Health check for webhook processing',
    description: 'Checks if the webhook processing system is healthy',
  })
  async getWebhookHealth(@Res() res: Response) {
    try {
      const health = await this.socialService.getWebhookHealth();
      return hasResponse(res, health);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWebhookHealth',
        'Health check failed',
      );
    }
  }
}
