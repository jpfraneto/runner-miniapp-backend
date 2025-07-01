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
}
