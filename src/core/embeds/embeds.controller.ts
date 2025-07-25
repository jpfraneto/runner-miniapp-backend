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

const DEFAULT_IMAGE_URL =
  'https://github.com/jpfraneto/images/blob/main/runnerimage.png?raw=true';

@ApiTags('embeds')
@Controller('embeds')
export class EmbedsController {
  private readonly logger = new Logger(EmbedsController.name);

  constructor(private readonly embedsService: EmbedsService) {}

  /**
   * Generate user's profile embed data (for Farcaster embeds)
   * URL: /embeds/user/:fid
   */
  @Get('/user/:fid')
  async getUserProfileEmbed(
    @Param('fid') fid: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating user's profile embed data for user FID: ${fid}`,
      );

      const embedData = await this.embedsService.generateUserEmbed(Number(fid));

      if (!embedData) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getUserProfileEmbed',
          'User not found',
        );
      }
      console.log('THE EMBED DATA IS:::: ', embedData);
      const html = `
      <html>
      <head>
        <title>Runnercoin</title>

       <meta name="fc:frame" content='{
    "version":"1",
    "imageUrl":"${DEFAULT_IMAGE_URL}",
    "button":{
      "title":  "View Profile",
      "action":{
        "type":"launch_frame",
        "name":"$RUNNER",
        "url":"https://runnercoin.lat/user/${fid}"
      }
    }
  }' />
      </head>
      <body>
        <p>Hello World</p>
      </body>
      </html>
    `;

      // Return JSON embed data
      res.setHeader('Content-Type', 'text/html');
      // res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      return res.send(html);
    } catch (error) {
      this.logger.error(
        `Error generating user profile embed for ${fid}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserProfileEmbed',
        error.message,
      );
    }
  }

  /**
   * Generate user's profile SVG image
   * URL: /embeds/user/:fid/image
   */
  @Get('/user/:fid/image')
  async getUserProfileImage(
    @Param('fid') fid: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating user's profile SVG for user FID: ${fid}`);

      const svgContent = await this.embedsService.generateUserEmbed(
        Number(fid),
      );

      if (!svgContent) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getUserProfileImage',
          'User not found',
        );
      }

      // Return SVG with proper content-type
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      return res.send(svgContent);
    } catch (error) {
      this.logger.error(`Error generating user profile SVG for ${fid}:`, error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserProfileImage',
        error.message,
      );
    }
  }

  /**
   * Generate dynamic embed for workout sharing
   * URL: /embeds/workout/:fid/:distance/:duration
   */
  @Get('/run/:castHash')
  async getWorkoutEmbed(
    @Param('castHash') castHash: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating workout embed for castHash: ${castHash}`);

      const embedHtml = await this.embedsService.generateRunEmbed(castHash);

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
      this.logger.error(
        `Error generating workout embed for castHash: ${castHash}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWorkoutEmbed',
        error.message,
      );
    }
  }

  /**
   * Generate leaderboard embed (Farcaster Mini App)
   * URL: /embeds/leaderboard/:week
   */
  @Get('/leaderboard/:week')
  async getLeaderboardEmbed(
    @Param('week') week: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating leaderboard embed for week: ${week}`);

      const html = await this.embedsService.generateLeaderboardEmbed(
        Number(week),
      );
      if (!html) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getLeaderboardEmbed',
          'Leaderboard not found',
        );
      }
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard embed for ${week}:`,
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
   * Generate workout miniapp HTML (Farcaster Mini App)
   * URL: /run/:castHash
   */
  @Get('/run/:castHash')
  async getWorkoutMiniApp(
    @Param('castHash') castHash: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(
        `Generating workout miniapp HTML for castHash: ${castHash}`,
      );
      const html = await this.embedsService.generateRunEmbed(castHash);
      if (!html) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getWorkoutMiniApp',
          'Workout not found',
        );
      }
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (error) {
      this.logger.error(
        `Error generating workout miniapp HTML for ${castHash}:`,
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWorkoutMiniApp',
        error.message,
      );
    }
  }

  /**
   * Generate workout SVG image
   * URL: /run/:castHash/image
   */
  @Get('/run/:castHash/image')
  async getWorkoutImageSvg(
    @Param('castHash') castHash: string,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      this.logger.log(`Generating workout SVG image for castHash: ${castHash}`);
      const svg = await this.embedsService.generateRunEmbed(castHash);
      if (!svg) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getWorkoutImageSvg',
          'Workout not found',
        );
      }
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(svg);
    } catch (error) {
      this.logger.error(`Error generating workout SVG for ${castHash}:`, error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWorkoutImageSvg',
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
