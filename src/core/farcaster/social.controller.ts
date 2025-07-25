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
import { SocialService, WebhookData } from './services/social.service';

// Security
import {
  AuthorizationGuard,
  BanGuard,
  QuickAuthPayload,
} from '../../security/guards';
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
  @UseGuards(BanGuard)
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
  @UseGuards(BanGuard)
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
  @UseGuards(BanGuard)
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
  @UseGuards(BanGuard)
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
      'Receives webhook from Neynar and processes casts for workout detection. This is the main webhook endpoint that handles all cast processing with built-in idempotency.',
  })
  async getCastWebhook(@Body() webhookData: any, @Res() res: Response) {
    try {
      console.log('📨 Farcaster cast webhook received');

      // Return 200 immediately to prevent duplicate webhook processing
      hasResponse(res, { message: 'Webhook received' });

      // Process webhook in background without awaiting
      setImmediate(async () => {
        try {
          console.log(
            '📊 Processing webhook data:',
            JSON.stringify(webhookData, null, 2),
          );
          const result = await this.socialService.processCastWebhook(
            webhookData,
            'prod',
          );

          if (result.success) {
            if (result.duplicate) {
              console.log('⚠️  Duplicate webhook detected - already processed');
            } else if (result.concurrent) {
              console.log(
                '⚠️  Concurrent processing detected - webhook ignored',
              );
            } else if (result.isReply) {
              console.log(
                '📝 Reply cast filtered - only processing root casts',
              );
            } else {
              console.log('✅ Webhook processed successfully');
            }
          } else {
            console.error('❌ Webhook processing failed:', result.error);
          }
        } catch (error) {
          console.error('❌ Error processing webhook in background:', error);
        }
      });
    } catch (error) {
      console.error('❌ Error receiving webhook:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCastWebhook',
        'Internal server error receiving webhook',
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
