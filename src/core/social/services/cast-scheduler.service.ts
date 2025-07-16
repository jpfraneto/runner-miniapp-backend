// src/core/social/services/cast-scheduler.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CastFetcherService } from './cast-fetcher.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';

@Injectable()
export class CastSchedulerService {
  private readonly logger = new Logger(CastSchedulerService.name);
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  constructor(
    private readonly castFetcherService: CastFetcherService,
    @InjectRepository(FarcasterCast)
    private readonly farcasterCastRepository: Repository<FarcasterCast>,
  ) {}

  @Cron(CronExpression.EVERY_15_MINUTES)
  async handleCastFetching(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('⚠️ Cast fetching already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      this.logger.log('🚀 Starting automated cast fetching cron job');
      
      // Check if we should continue based on consecutive failures
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        this.logger.error(`❌ Too many consecutive failures (${this.consecutiveFailures}). Skipping this run.`);
        this.logger.log('💡 Manual intervention may be required. Check logs and restart service.');
        return;
      }

      // Log system status
      await this.logSystemStatus();

      // Fetch and process latest casts
      await this.castFetcherService.fetchAndProcessLatestCasts();

      // Update success metrics
      this.lastRunTime = new Date();
      this.consecutiveFailures = 0;

      const duration = Date.now() - startTime.getTime();
      this.logger.log(`✅ Cast fetching cron job completed successfully in ${duration}ms`);

    } catch (error) {
      this.consecutiveFailures++;
      const duration = Date.now() - startTime.getTime();
      
      this.logger.error(`❌ Cast fetching cron job failed after ${duration}ms (failure #${this.consecutiveFailures}):`, error);
      
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        this.logger.error(`🚨 CRITICAL: ${this.MAX_CONSECUTIVE_FAILURES} consecutive failures. Automated processing will stop.`);
        this.logger.log('💡 To resume: Fix the underlying issue and restart the service.');
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async logSystemStatus() {
    try {
      // Get stats from the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const recentCasts = await this.farcasterCastRepository.count({
        where: {
          createdAt: MoreThan(twentyFourHoursAgo),
        },
      });

      const lastProcessedCast = await this.farcasterCastRepository.findOne({
        order: { createdAt: 'DESC' },
        select: ['createdAt', 'farcasterCastHash'],
      });

      this.logger.log(`📊 System Status:`);
      this.logger.log(`   • Last run: ${this.lastRunTime ? this.lastRunTime.toISOString() : 'Never'}`);
      this.logger.log(`   • Consecutive failures: ${this.consecutiveFailures}`);
      this.logger.log(`   • Casts processed in last 24h: ${recentCasts}`);
      this.logger.log(`   • Last processed cast: ${lastProcessedCast?.createdAt.toISOString() || 'None'}`);
      
      if (lastProcessedCast) {
        const timeSinceLastCast = Date.now() - lastProcessedCast.createdAt.getTime();
        const hoursSinceLastCast = Math.floor(timeSinceLastCast / (1000 * 60 * 60));
        this.logger.log(`   • Hours since last cast: ${hoursSinceLastCast}`);
      }

    } catch (error) {
      this.logger.warn('⚠️ Could not gather system status:', error);
    }
  }

  // Manual trigger for testing or emergency processing
  async triggerManualFetch(): Promise<{ success: boolean; message: string; duration?: number }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Cast fetching already in progress',
      };
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      this.logger.log('🔧 Manual cast fetching trigger initiated');
      
      await this.castFetcherService.fetchAndProcessLatestCasts();
      
      this.lastRunTime = new Date();
      this.consecutiveFailures = 0;
      
      const duration = Date.now() - startTime;
      
      this.logger.log(`✅ Manual cast fetching completed successfully in ${duration}ms`);
      
      return {
        success: true,
        message: `Manual cast fetching completed successfully in ${duration}ms`,
        duration,
      };
    } catch (error) {
      this.consecutiveFailures++;
      const duration = Date.now() - startTime;
      
      this.logger.error(`❌ Manual cast fetching failed after ${duration}ms:`, error);
      
      return {
        success: false,
        message: `Manual cast fetching failed: ${error.message}`,
        duration,
      };
    } finally {
      this.isRunning = false;
    }
  }

  // Get current scheduler status
  getStatus(): {
    isRunning: boolean;
    lastRunTime: Date | null;
    consecutiveFailures: number;
    nextRunEstimate: Date;
  } {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      consecutiveFailures: this.consecutiveFailures,
      nextRunEstimate: this.getNextRunTime(),
    };
  }

  // Reset failure counter (for manual intervention)
  resetFailureCounter(): void {
    this.consecutiveFailures = 0;
    this.logger.log('🔄 Failure counter reset manually');
  }

  // Health check for the scheduler
  async healthCheck(): Promise<{ 
    status: string; 
    isRunning: boolean; 
    lastRunTime: Date | null; 
    consecutiveFailures: number;
    systemHealth: any;
  }> {
    try {
      // Check underlying services health
      const fetcherHealth = await this.castFetcherService.healthCheck();
      
      const isHealthy = 
        fetcherHealth.status === 'healthy' && 
        this.consecutiveFailures < this.MAX_CONSECUTIVE_FAILURES;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        isRunning: this.isRunning,
        lastRunTime: this.lastRunTime,
        consecutiveFailures: this.consecutiveFailures,
        systemHealth: {
          fetcher: fetcherHealth,
          maxFailuresReached: this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES,
        },
      };
    } catch (error) {
      this.logger.error('❌ Scheduler health check failed:', error);
      return {
        status: 'unhealthy',
        isRunning: this.isRunning,
        lastRunTime: this.lastRunTime,
        consecutiveFailures: this.consecutiveFailures,
        systemHealth: {
          error: error.message,
        },
      };
    }
  }

  private getNextRunTime(): Date {
    const now = new Date();
    const nextRun = new Date(now);

    // Find next 15-minute interval
    const minutes = now.getMinutes();
    const nextInterval = Math.ceil(minutes / 15) * 15;

    if (nextInterval === 60) {
      nextRun.setHours(now.getHours() + 1);
      nextRun.setMinutes(0);
    } else {
      nextRun.setMinutes(nextInterval);
    }

    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);

    return nextRun;
  }
}
