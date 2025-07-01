// src/core/embeds/services/embeds.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../models';
import { getConfig } from '../../../security/config';

import { EmbedData } from './embeds.types';

@Injectable()
export class EmbedsService {
  private readonly logger = new Logger(EmbedsService.name);
  private readonly config = getConfig();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Generate dynamic embed HTML for running achievement sharing
   */
  async generateAchievementEmbed(
    userId: number,
    achievementType: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
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
        `Error generating achievement embed for ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate HTML that renders as an image for running achievement
   */
  async generateAchievementImageHtml(
    userId: number,
    achievementType: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User not found for image: ${userId}`);
        return null;
      }

      return this.generateAchievementImageTemplate(user, achievementType);
    } catch (error) {
      this.logger.error(
        `Error generating achievement image HTML for ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate leaderboard embed with proper image URL
   */
  async generateLeaderboardEmbed(userId: number): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        return null;
      }

      // Get user's rank (simplified - you might want to use your existing leaderboard logic)
      const rank = await this.getUserRank(userId);

      const embedData: EmbedData = {
        title: `${user.username} on Running Leaderboard`,
        description: `Rank #${rank} with ${user.runnerTokens} tokens | Join the running community and track your progress!`,
        imageUrl:
          'https://github.com/jpfraneto/images/blob/main/dynamic.png?raw=true',
        targetUrl: `https://runnercoin.lat/leaderboard`,
      };

      return this.generateEmbedHtml(embedData, 'leaderboard');
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard embed for ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate leaderboard image HTML
   */
  async generateLeaderboardImageHtml(userId: number): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User not found for image: ${userId}`);
        return null;
      }

      const rank = await this.getUserRank(userId);
      return this.generateLeaderboardImageTemplate(user, rank);
    } catch (error) {
      this.logger.error(
        `Error generating leaderboard image HTML for ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Generate workout session embed
   */
  async generateWorkoutEmbed(
    userId: number,
    distance: number,
    duration: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
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
      this.logger.error(`Error generating workout embed for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Generate workout image HTML
   */
  async generateWorkoutImageHtml(
    userId: number,
    distance: number,
    duration: string,
  ): Promise<string | null> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User not found for image: ${userId}`);
        return null;
      }

      return this.generateWorkoutImageTemplate(user, distance, duration);
    } catch (error) {
      this.logger.error(
        `Error generating workout image HTML for ${userId}:`,
        error,
      );
      return null;
    }
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
          <div class="points">${user.runnerTokens} total tokens</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate leaderboard image template
   */
  private generateLeaderboardImageTemplate(user: any, rank: number): string {
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
          <div class="points">${user.runnerTokens} tokens</div>
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
  private async getUserRank(userId: number): Promise<number> {
    try {
      const users = await this.userRepository.find({
        select: ['id', 'runnerTokens'],
        order: { runnerTokens: 'DESC' },
      });

      const userIndex = users.findIndex((user) => user.id === userId);
      return userIndex !== -1 ? userIndex + 1 : 0;
    } catch (error) {
      this.logger.error('Error getting user rank:', error);
      return 0;
    }
  }
}
