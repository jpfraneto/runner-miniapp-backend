// src/core/embeds/embeds.controller.ts

import {
  Controller,
  Get,
  Param,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { EmbedsService } from './services';
import { hasError } from '../../utils';

@ApiTags('embeds')
@Controller('embeds')
export class EmbedsController {
  private readonly logger = new Logger(EmbedsController.name);

  constructor(private readonly embedsService: EmbedsService) {}

  /**
   * Generate dynamic embed for running achievement sharing
   * URL: /embeds/achievement/:userId/:achievementType
   */
  @Get('/achievement/:userId/:achievementType')
  async getAchievementEmbed(
    @Param('userId') userId: string,
    @Param('achievementType') achievementType: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating achievement embed for user ID: ${userId}, achievement: ${achievementType}`,
      );

      const embedHtml = await this.embedsService.generateAchievementEmbed(
        Number(userId),
        achievementType,
      );

      if (!embedHtml) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getAchievementEmbed',
          'User not found',
        );
      }

      // Return HTML with proper content-type
      res.setHeader('Content-Type', 'text/html');
      return res.send(embedHtml);
    } catch (error) {
      this.logger.error(
        `Error generating achievement embed for ${userId}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAchievementEmbed',
        error.message,
      );
    }
  }

  /**
   * Generate achievement image (PNG)
   * URL: /embeds/achievement/:userId/:achievementType/image
   */
  @Get('/achievement/:userId/:achievementType/image')
  async getAchievementImage(
    @Param('userId') userId: string,
    @Param('achievementType') achievementType: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating achievement image for user ID: ${userId}, achievement: ${achievementType}`,
      );

      const imageHtml = await this.embedsService.generateAchievementImageHtml(
        Number(userId),
        achievementType,
      );

      if (!imageHtml) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getAchievementImage',
          'User not found',
        );
      }

      // Return HTML that renders as an image
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      return res.send(imageHtml);
    } catch (error) {
      this.logger.error(
        `Error generating achievement image for ${userId}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAchievementImage',
        error.message,
      );
    }
  }

  /**
   * Generate dynamic embed for workout sharing
   * URL: /embeds/workout/:userId/:distance/:duration
   */
  @Get('/workout/:userId/:distance/:duration')
  async getWorkoutEmbed(
    @Param('userId') userId: string,
    @Param('distance') distance: string,
    @Param('duration') duration: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating workout embed for user ID: ${userId}, distance: ${distance}km, duration: ${duration}`,
      );

      const embedHtml = await this.embedsService.generateWorkoutEmbed(
        Number(userId),
        Number(distance),
        duration,
      );

      if (!embedHtml) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getWorkoutEmbed',
          'User not found',
        );
      }

      res.setHeader('Content-Type', 'text/html');
      return res.send(embedHtml);
    } catch (error) {
      this.logger.error(`Error generating workout embed for ${userId}:`, error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWorkoutEmbed',
        error.message,
      );
    }
  }

  /**
   * Generate workout image (PNG)
   * URL: /embeds/workout/:userId/:distance/:duration/image
   */
  @Get('/workout/:userId/:distance/:duration/image')
  async getWorkoutImage(
    @Param('userId') userId: string,
    @Param('distance') distance: string,
    @Param('duration') duration: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating workout image for user ID: ${userId}, distance: ${distance}km, duration: ${duration}`,
      );

      const imageHtml = await this.embedsService.generateWorkoutImageHtml(
        Number(userId),
        Number(distance),
        duration,
      );

      if (!imageHtml) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getWorkoutImage',
          'User not found',
        );
      }

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageHtml);
    } catch (error) {
      this.logger.error(`Error generating workout image for ${userId}:`, error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWorkoutImage',
        error.message,
      );
    }
  }

  /**
   * Generate dynamic embed for leaderboard position sharing
   * URL: /embeds/leaderboard/:userId
   */
  @Get('/leaderboard/:userId')
  async getLeaderboardEmbed(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating leaderboard embed for user ID: ${userId}`);

      const embedHtml = await this.embedsService.generateLeaderboardEmbed(
        Number(userId),
      );

      if (!embedHtml) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getLeaderboardEmbed',
          'User not found',
        );
      }

      res.setHeader('Content-Type', 'text/html');
      return res.send(embedHtml);
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard embed for ${userId}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getLeaderboardEmbed',
        error.message,
      );
    }
  }

  /**
   * Generate leaderboard image (PNG)
   * URL: /embeds/leaderboard/:userId/image
   */
  @Get('/leaderboard/:userId/image')
  async getLeaderboardImage(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating leaderboard image for user ID: ${userId}`);

      const imageHtml = await this.embedsService.generateLeaderboardImageHtml(
        Number(userId),
      );

      if (!imageHtml) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getLeaderboardImage',
          'User not found',
        );
      }

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(imageHtml);
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard image for ${userId}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getLeaderboardImage',
        error.message,
      );
    }
  }

  /**
   * Health check endpoint
   * URL: /embeds/health
   */
  @Get('/health')
  async healthCheck(@Res() res: Response): Promise<Response> {
    try {
      this.logger.log('Health check requested');
      return res.status(HttpStatus.OK).json({
        status: 'ok',
        service: 'embeds',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Health check error:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'healthCheck',
        error.message,
      );
    }
  }
}
