// src/core/embeds/services/embeds.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../models';
import { getConfig } from '../../../security/config';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';

import { EmbedData } from './embeds.types';

@Injectable()
export class EmbedsService {
  private readonly logger = new Logger(EmbedsService.name);
  private readonly config = getConfig();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
  ) {}

  /**
   * Generate dynamic embed HTML for running achievement sharing
   */
  async generateAchievementEmbed(
    fid: number,
    achievementType: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found: ${fid}`);
        return null;
      }

      const embedData: EmbedData = {
        title: `🏃‍♂️ Running Achievement`,
        description: `${user.username} just achieved ${achievementType}! Join the running community and track your progress.`,
        imageUrl:
          'https://github.com/jpfraneto/images/blob/main/dynamic.png?raw=true',
        targetUrl: `https://runnercoin.lat`,
      };
      return this.generateEmbedHtml(embedData, 'achievement');
    } catch (error) {
      this.logger.error(
        `Error generating achievement embed for ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate HTML that renders as an image for running achievement
   */
  async generateAchievementImageHtml(
    fid: number,
    achievementType: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for image: ${fid}`);
        return null;
      }

      return this.generateAchievementImageTemplate(user, achievementType);
    } catch (error) {
      this.logger.error(
        `Error generating achievement image HTML for ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate leaderboard embed with proper image URL
   */
  async generateLeaderboardEmbed(fid: number): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found: ${fid}`);
        return null;
      }

      // Get user's rank (simplified - you might want to use your existing leaderboard logic)
      const rank = await this.getUserRank(fid);

      // Safely coerce numeric values with defaults
      const runnerTokens = Number(user.runnerTokens) || 0;

      const embedData: EmbedData = {
        title: `${user.username} on Running Leaderboard`,
        description: `Rank #${rank} with ${runnerTokens} tokens | Join the running community and track your progress!`,
        imageUrl:
          'https://github.com/jpfraneto/images/blob/main/dynamic.png?raw=true',
        targetUrl: `https://runnercoin.lat/leaderboard`,
      };

      return this.generateEmbedHtml(embedData, 'leaderboard');
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard embed for ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate leaderboard image HTML
   */
  async generateLeaderboardImageHtml(fid: number): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for image: ${fid}`);
        return null;
      }

      const rank = await this.getUserRank(fid);
      return this.generateLeaderboardImageTemplate(user, rank);
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard image HTML for ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate workout session embed
   */
  async generateWorkoutEmbed(
    fid: number,
    distance: number,
    duration: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found: ${fid}`);
        return null;
      }

      const embedData: EmbedData = {
        title: `🏃‍♂️ ${user.username} just completed a run!`,
        description: `Distance: ${distance}km | Duration: ${duration} | Keep up the great work!`,
        imageUrl:
          'https://github.com/jpfraneto/images/blob/main/dynamic.png?raw=true',
        targetUrl: `https://runnercoin.lat`,
      };
      return this.generateEmbedHtml(embedData, 'workout');
    } catch (error) {
      this.logger.error(`Error generating workout embed for ${fid}:`, error);
      return null;
    }
  }

  /**
   * Generate user's profile embed data (for Farcaster embeds)
   */
  async generateUserProfileEmbedData(fid: number): Promise<EmbedData | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
        relations: ['detailedStats'],
      });

      if (!user) {
        this.logger.warn(`User not found: ${fid}`);
        return null;
      }

      const baseUrl = this.config.isProduction
        ? 'https://api.runnercoin.lat'
        : `https://poiesis.anky.app`;

      return {
        title: `${user.username}'s`,
        description: `${user.username} profile on /running`,
        imageUrl: `${baseUrl}/embeds/user/${user.fid}/image`,
        targetUrl: this.config.isProduction
          ? `https://runnercoin.lat/user/${user.fid}`
          : `https://miniapp.anky.app/user/${user.fid}`,
      };
    } catch (error) {
      this.logger.error(
        `Error generating user profile embed data for ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate user's profile SVG image string
   */
  async generateUserProfileSvgString(fid: number): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
        relations: ['detailedStats'],
      });

      if (!user) {
        this.logger.warn(`User not found: ${fid}`);
        return null;
      }

      return this.generateUserProfileSvgContent(user);
    } catch (error) {
      this.logger.error(`Error generating user profile SVG for ${fid}:`, error);
      return null;
    }
  }

  /**
   * Generate workout image HTML
   */
  async generateWorkoutImageHtml(
    fid: number,
    distance: number,
    duration: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { fid },
      });

      if (!user) {
        this.logger.warn(`User not found for image: ${fid}`);
        return null;
      }

      return this.generateWorkoutImageTemplate(user, distance, duration);
    } catch (error) {
      this.logger.error(
        `Error generating workout image HTML for ${fid}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate workout miniapp HTML (Farcaster Mini App)
   */
  async generateWorkoutMiniAppHtml(castHash: string): Promise<string | null> {
    // Find the RunningSession by castHash, join User
    const run = await this.runningSessionRepository.findOne({
      where: { castHash },
      relations: ['user'],
    });
    if (!run || !run.user) {
      this.logger.warn(`Workout not found for castHash: ${castHash}`);
      return null;
    }
    const user = run.user;

    // Calculate derived stats
    const distance = Number(run.distance) || 0;
    const duration = Number(run.duration) || 0;
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    const durationFormatted = `${hours}h ${minutes}m`;
    const pace = run.pace || 'N/A';
    const username = user.username ? `@${user.username}` : '@user';
    const imageUrl = `${this.config.isProduction ? 'https://api.runnercoin.lat' : 'https://poiesis.anky.app'}/embeds/run/${castHash}/image`;
    const targetUrl = this.config.isProduction
      ? `https://runnercoin.lat/runs/${castHash}`
      : `https://miniapp.anky.app/runs/${castHash}`;

    // HTML with meta tags for Farcaster Mini App
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${username}'s Run</title>
        <meta name="fc:miniapp" content='{"version":"1","imageUrl":"${imageUrl}","button":{"title":"see run","action":{"type":"launch_miniapp","name":"RunnerCoin","url":"${targetUrl}"}}}' />
        <meta name="fc:frame" content='{"version":"1","imageUrl":"${imageUrl}","button":{"title":"see run","action":{"type":"launch_frame","name":"RunnerCoin","url":"${targetUrl}"}}}' />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            min-height: 100vh; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: flex-start; 
          }
          .container { 
            width: 90vw; 
            max-width: 424px; 
            margin: 0 auto; 
            padding-top: 32px; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
          }
          .username { 
            font-size: 1.5rem; 
            font-weight: bold; 
            margin-bottom: 24px; 
            background: linear-gradient(45deg, #ffd700, #ffed4e); 
            -webkit-background-clip: text; 
            -webkit-text-fill-color: transparent; 
          }
          .stat { 
            width: 100%; 
            background: rgba(255,255,255,0.08); 
            border-radius: 16px; 
            margin-bottom: 18px; 
            padding: 18px 0; 
            text-align: center; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.08); 
          }
          .stat-value { 
            font-size: 2.2rem; 
            font-weight: bold; 
            margin-bottom: 4px; 
          }
          .stat-label { 
            font-size: 1rem; 
            opacity: 0.85; 
          }
          .footer { 
            margin-top: 32px; 
            font-size: 1rem; 
            opacity: 0.7; 
            text-align: center; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="username">${username} on /running</div>
          <div class="stat">
            <div class="stat-value" style="color:#00FF88;">${distance.toFixed(2)}</div>
            <div class="stat-label">Distance (km)</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#4facfe;">${durationFormatted}</div>
            <div class="stat-label">Duration</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#FFD700;">${pace}</div>
            <div class="stat-label">Avg Pace</div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate SVG image for a workout session by castHash
   */
  async generateWorkoutSvgImage(castHash: string): Promise<string | null> {
    const run = await this.runningSessionRepository.findOne({
      where: { castHash },
      relations: ['user'],
    });
    if (!run || !run.user) {
      this.logger.warn(`Workout not found for castHash: ${castHash}`);
      return null;
    }
    const user = run.user;

    // Safely coerce numeric values with defaults
    const distance = Number(run.distance) || 0;
    const duration = Number(run.duration) || 0;
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    const durationFormatted = `${hours}h ${minutes}m`;
    const pace = run.pace || 'N/A';
    const username = user.username ? `@${user.username}` : '@user';

    // SVG dimensions for 1:1.91 aspect ratio (900x471) - same as user profile
    return `
      <svg width="900" height="471" viewBox="0 0 900 471" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect width="900" height="471" fill="url(#bgGradient)"/>
        <text x="50%" y="80" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="white" filter="url(#glow)" text-anchor="middle">
          🏃‍♂️
        </text>
        <text x="50%" y="130" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" filter="url(#glow)" text-anchor="middle">
          ${username} on /running
        </text>
        <g>
          <text x="50%" y="200" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#00FF88" text-anchor="middle">${distance.toFixed(2)}</text>
          <text x="50%" y="235" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Distance (km)</text>
        </g>
        <g>
          <text x="50%" y="275" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#4facfe" text-anchor="middle">${durationFormatted}</text>
          <text x="50%" y="310" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Duration</text>
        </g>
        <g>
          <text x="50%" y="350" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#FFD700" text-anchor="middle">${pace}</text>
          <text x="50%" y="385" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Avg Pace</text>
        </g>
      </svg>
    `;
  }

  /**
   * Generate embed HTML with proper meta tags
   */
  private generateEmbedHtml(embedData: EmbedData, type: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="website">
        <meta property="og:url" content="${embedData.targetUrl}">
        <meta property="og:title" content="${embedData.title}">
        <meta property="og:description" content="${embedData.description}">
        <meta property="og:image" content="${embedData.imageUrl}">
        
        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="${embedData.targetUrl}">
        <meta property="twitter:title" content="${embedData.title}">
        <meta property="twitter:description" content="${embedData.description}">
        <meta property="twitter:image" content="${embedData.imageUrl}">
        
        <title>${embedData.title}</title>
        
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #000;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          
          .container {
            text-align: center;
            max-width: 600px;
            padding: 20px;
          }
          
          .title {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 1rem;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          
          .description {
            font-size: 1.2rem;
            line-height: 1.6;
            margin-bottom: 2rem;
            opacity: 0.9;
          }
          
          .cta {
            display: inline-block;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            transition: transform 0.2s;
          }
          
          .cta:hover {
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="title">${embedData.title}</h1>
          <p class="description">${embedData.description}</p>
          <a href="${embedData.targetUrl}" class="cta">Join RunnerCoin</a>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate achievement image template
   */
  private generateAchievementImageTemplate(
    user: any,
    achievementType: string,
  ): string {
    // Safely coerce numeric values with defaults
    const runnerTokens = Number(user.runnerTokens) || 0;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          
          .achievement-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }
          
          .achievement-icon {
            font-size: 4rem;
            margin-bottom: 20px;
          }
          
          .username {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 10px;
          }
          
          .achievement-text {
            font-size: 1.5rem;
            margin-bottom: 20px;
          }
          
          .points {
            font-size: 1.2rem;
            opacity: 0.9;
          }
        </style>
      </head>
      <body>
        <div class="achievement-card">
          <div class="achievement-icon">🏆</div>
          <div class="username">${user.username}</div>
          <div class="achievement-text">Achieved ${achievementType}!</div>
          <div class="points">${runnerTokens} total tokens</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate leaderboard image template
   */
  private generateLeaderboardImageTemplate(user: any, rank: number): string {
    // Safely coerce numeric values with defaults
    const runnerTokens = Number(user.runnerTokens) || 0;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          
          .leaderboard-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }
          
          .rank {
            font-size: 3rem;
            font-weight: bold;
            margin-bottom: 20px;
            background: linear-gradient(45deg, #ffd700, #ffed4e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          
          .username {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 10px;
          }
          
          .points {
            font-size: 1.5rem;
            margin-bottom: 20px;
            opacity: 0.9;
          }
          
          .subtitle {
            font-size: 1.2rem;
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <div class="leaderboard-card">
          <div class="rank">#${rank}</div>
          <div class="username">${user.username}</div>
          <div class="points">${runnerTokens} tokens</div>
          <div class="subtitle">RunnerCoin Leaderboard</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate workout image template
   */
  private generateWorkoutImageTemplate(
    user: any,
    distance: number,
    duration: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          
          .workout-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }
          
          .workout-icon {
            font-size: 4rem;
            margin-bottom: 20px;
          }
          
          .username {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 20px;
          }
          
          .stats {
            display: flex;
            justify-content: space-around;
            margin-bottom: 20px;
          }
          
          .stat {
            text-align: center;
          }
          
          .stat-value {
            font-size: 1.5rem;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .stat-label {
            font-size: 1rem;
            opacity: 0.8;
          }
          
          .subtitle {
            font-size: 1.2rem;
            opacity: 0.8;
          }
        </style>
      </head>
      <body>
        <div class="workout-card">
          <div class="workout-icon">🏃‍♂️</div>
          <div class="username">${user.username}</div>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${distance}km</div>
              <div class="stat-label">Distance</div>
            </div>
            <div class="stat">
              <div class="stat-value">${duration}</div>
              <div class="stat-label">Duration</div>
            </div>
          </div>
          <div class="subtitle">Great run! Keep it up!</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get user's rank in the leaderboard
   */
  private async getUserRank(fid: number): Promise<number> {
    try {
      const users = await this.userRepository.find({
        select: ['fid', 'runnerTokens'],
        order: { runnerTokens: 'DESC' },
      });

      const userIndex = users.findIndex((user) => user.fid === fid);
      return userIndex !== -1 ? userIndex + 1 : 0;
    } catch (error) {
      this.logger.error('Error getting user rank:', error);
      return 0;
    }
  }

  /**
   * Generate SVG URL for user profile stats
   */
  private async generateUserProfileSvgUrl(user: any): Promise<string> {
    try {
      const svgContent = this.generateUserProfileSvgContent(user);
      const encodedSvg = encodeURIComponent(svgContent);
      return `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
    } catch (error) {
      this.logger.error(
        `Error generating SVG URL for user ${user.fid}:`,
        error,
      );
      return 'https://github.com/jpfraneto/images/blob/main/dynamic.png?raw=true';
    }
  }

  /**
   * Generate SVG image for user overall stats only
   */
  private generateUserProfileSvgContent(user: any): string {
    // Safely coerce numeric values with defaults
    const totalRuns = Number(user.totalRuns) || 0;
    const totalDistance = Number(user.totalDistance) || 0;
    const totalTimeMinutes = Number(user.totalTimeMinutes) || 0;

    // Calculate derived stats
    const totalHours = Math.floor(totalTimeMinutes / 60);
    const totalMinutes = totalTimeMinutes % 60;
    const totalTimeFormatted = `${totalHours}h ${totalMinutes}m`;
    const avgPace =
      totalDistance > 0 && totalTimeMinutes > 0
        ? `${Math.floor(totalTimeMinutes / totalDistance)}:${String(Math.round(((totalTimeMinutes / totalDistance) % 1) * 60)).padStart(2, '0')}/km`
        : 'N/A';

    // Username display
    const username = user.username
      ? `@${user.username} on /running`
      : '@user on /running';

    // SVG dimensions for 1:1.91 aspect ratio (900x471)
    return `
      <svg width="900" height="471" viewBox="0 0 900 471" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect width="900" height="471" fill="url(#bgGradient)"/>
        <text x="50%" y="80" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="white" filter="url(#glow)" text-anchor="middle">
          🏃‍♂️
        </text>
        <text x="50%" y="130" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" filter="url(#glow)" text-anchor="middle">
          ${username}
        </text>
        <g>
          <text x="50%" y="200" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#FFD700" text-anchor="middle">${totalRuns}</text>
          <text x="50%" y="235" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Runs</text>
        </g>
        <g>
          <text x="50%" y="275" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#00FF88" text-anchor="middle">${totalDistance.toFixed(1)}</text>
          <text x="50%" y="310" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Total km</text>
        </g>
        <g>
          <text x="50%" y="350" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#4facfe" text-anchor="middle">${totalTimeFormatted}</text>
          <text x="50%" y="385" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Total Time</text>
        </g>
        <g>
          <text x="50%" y="425" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#FFD700" text-anchor="middle">${avgPace}</text>
          <text x="50%" y="460" font-family="Arial, sans-serif" font-size="22" fill="white" text-anchor="middle">Avg Pace</text>
        </g>
        <text x="50%" y="495" font-family="Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.7)" text-anchor="middle">
          Track your runs • Earn tokens • Connect with runners worldwide
        </text>
      </svg>
    `;
  }
}
