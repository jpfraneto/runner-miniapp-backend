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
   * URL: /embeds/achievement/:fid/:achievementType
   */
  @Get('/achievement/:fid/:achievementType')
  async getAchievementEmbed(
    @Param('fid') fid: string,
    @Param('achievementType') achievementType: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating achievement embed for user FID: ${fid}, achievement: ${achievementType}`,
      );

      const embedHtml = await this.embedsService.generateAchievementEmbed(
        Number(fid),
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
        `Error generating achievement embed for ${fid}:`,
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
   * URL: /embeds/achievement/:fid/:achievementType/image
   */
  @Get('/achievement/:fid/:achievementType/image')
  async getAchievementImage(
    @Param('fid') fid: string,
    @Param('achievementType') achievementType: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating achievement image for user FID: ${fid}, achievement: ${achievementType}`,
      );

      const imageHtml = await this.embedsService.generateAchievementImageHtml(
        Number(fid),
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
        `Error generating achievement image for ${fid}:`,
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
   * URL: /embeds/workout/:fid/:distance/:duration
   */
  @Get('/workout/:fid/:distance/:duration')
  async getWorkoutEmbed(
    @Param('fid') fid: string,
    @Param('distance') distance: string,
    @Param('duration') duration: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating workout embed for user FID: ${fid}, distance: ${distance}km, duration: ${duration}`,
      );

      const embedHtml = await this.embedsService.generateWorkoutEmbed(
        Number(fid),
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
      this.logger.error(`Error generating workout embed for ${fid}:`, error);
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
   * URL: /embeds/workout/:fid/:distance/:duration/image
   */
  @Get('/workout/:fid/:distance/:duration/image')
  async getWorkoutImage(
    @Param('fid') fid: string,
    @Param('distance') distance: string,
    @Param('duration') duration: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating workout image for user FID: ${fid}, distance: ${distance}km, duration: ${duration}`,
      );

      const imageHtml = await this.embedsService.generateWorkoutImageHtml(
        Number(fid),
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
      this.logger.error(`Error generating workout image for ${fid}:`, error);
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
   * URL: /embeds/leaderboard/:fid
   */
  @Get('/leaderboard/:fid')
  async getLeaderboardEmbed(
    @Param('fid') fid: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating leaderboard embed for user FID: ${fid}`);

      const embedHtml = await this.embedsService.generateLeaderboardEmbed(
        Number(fid),
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
        `Error generating leaderboard embed for ${fid}:`,
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
   * URL: /embeds/leaderboard/:fid/image
   */
  @Get('/leaderboard/:fid/image')
  async getLeaderboardImage(
    @Param('fid') fid: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating leaderboard image for user FID: ${fid}`);

      const imageHtml = await this.embedsService.generateLeaderboardImageHtml(
        Number(fid),
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
        `Error generating leaderboard image for ${fid}:`,
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
