// src/core/embeds/services/embeds.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../models';
import { getConfig } from '../../../security/config';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';

const FRONTEND_BASE_URL = 'https://runnercoin.lat';
const DEFAULT_IMAGE_URL =
  'https://github.com/jpfraneto/images/blob/main/runnerimage.png?raw=true';

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
   * Generate HTML head for run embed - points to /run/:castHash
   */
  async generateRunEmbed(castHash: string): Promise<string | null> {
    try {
      this.logger.log(`Generating run embed for castHash: ${castHash}`);

      const run = await this.runningSessionRepository.findOne({
        where: { castHash },
        relations: ['user'],
      });

      if (!run || !run.user) {
        this.logger.warn(`Run not found for castHash: ${castHash}`);
        return null;
      }

      const targetUrl = `${FRONTEND_BASE_URL}/run/${castHash}`;
      const title = `${run.user.username}'s Run`;
      const distance = Number(run.distanceMeters) || 0;
      const duration = Number(run.duration) || 0;

      const miniappEmbed = {
        version: '1',
        imageUrl: DEFAULT_IMAGE_URL,
        button: {
          title: 'View Run',
          action: {
            type: 'launch_miniapp',
            name: '$RUNNER',
            url: targetUrl,
          },
        },
      };

      const frameEmbed = {
        version: '1',
        imageUrl: DEFAULT_IMAGE_URL,
        button: {
          title: 'View Run',
          action: {
            type: 'launch_frame',
            name: '$RUNNER',
            url: targetUrl,
          },
        },
      };

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="fc:miniapp" content='${JSON.stringify(miniappEmbed)}' />
  <meta name="fc:frame" content='${JSON.stringify(frameEmbed)}' />
</head>
<body>
  <p>${run.user.username} ran ${distance.toFixed(2)}km in ${duration} minutes</p>
</body>
</html>`;

      return html;
    } catch (error) {
      this.logger.error(`Error generating run embed for ${castHash}:`, error);
      return null;
    }
  }

  /**
   * Generate HTML head for user embed - points to /user/:fid
   */
  async generateUserEmbed(fid: number): Promise<string | null> {
    try {
      this.logger.log(`Generating user embed for fid: ${fid}`);

      const user = await this.userRepository.findOne({
        where: { fid },
        relations: [],
      });

      if (!user) {
        this.logger.warn(`User not found: ${fid}`);
        return null;
      }

      const targetUrl = `${FRONTEND_BASE_URL}/user/${fid}`;
      const title = `${user.username}'s Profile`;

      const miniappEmbed = {
        version: '1',
        imageUrl: DEFAULT_IMAGE_URL,
        button: {
          title: 'View Profile',
          action: {
            type: 'launch_miniapp',
            name: '$RUNNER',
            url: targetUrl,
          },
        },
      };

      const frameEmbed = {
        version: '1',
        imageUrl: DEFAULT_IMAGE_URL,
        button: {
          title: 'View Profile',
          action: {
            type: 'launch_frame',
            name: '$RUNNER',
            url: targetUrl,
          },
        },
      };

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="fc:miniapp" content='${JSON.stringify(miniappEmbed)}' />
  <meta name="fc:frame" content='${JSON.stringify(frameEmbed)}' />
</head>
<body>
  <p>${user.username} on $RUNNER</p>
</body>
</html>`;

      return html;
    } catch (error) {
      this.logger.error(`Error generating user embed for ${fid}:`, error);
      return null;
    }
  }

  /**
   * Generate HTML head for leaderboard embed - points to /leaderboard with query params
   */
  async generateLeaderboardEmbed(week?: number): Promise<string | null> {
    try {
      this.logger.log(
        `Generating leaderboard embed for week: ${week || 'current'}`,
      );

      // Build URL with query parameters
      const queryParams = new URLSearchParams();
      if (week) {
        queryParams.set('week', week.toString());
      }

      const targetUrl = `${FRONTEND_BASE_URL}/leaderboard${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      const title = week ? `Week ${week} Leaderboard` : 'Leaderboard';
      const buttonTitle = week ? `Week ${week}` : 'Leaderboard';

      const miniappEmbed = {
        version: '1',
        imageUrl: DEFAULT_IMAGE_URL,
        button: {
          title: buttonTitle,
          action: {
            type: 'launch_miniapp',
            name: '$RUNNER',
            url: targetUrl,
          },
        },
      };

      const frameEmbed = {
        version: '1',
        imageUrl: DEFAULT_IMAGE_URL,
        button: {
          title: buttonTitle,
          action: {
            type: 'launch_frame',
            name: '$RUNNER',
            url: targetUrl,
          },
        },
      };

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="fc:miniapp" content='${JSON.stringify(miniappEmbed)}' />
  <meta name="fc:frame" content='${JSON.stringify(frameEmbed)}' />
</head>
<body>
  <p>View the ${title.toLowerCase()} and see top runners!</p>
</body>
</html>`;

      return html;
    } catch (error) {
      this.logger.error(`Error generating leaderboard embed:`, error);
      return null;
    }
  }
}
