// src/core/social/services/cast-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { InjectRepository } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { User } from '../../../models/User/User.model';
import { UserRoleEnum } from '../../../models/User/User.types';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
// Note: FarcasterCast and UnitType models have been removed
// import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';
// import { UnitType } from '../../../models/RunningSession/RunningSession.model';
import { PROMPT_THREE } from 'src/core/training/services/prompts';
import { PROMPT_THREE_FALLBACK } from 'src/core/training/services/prompts-fallback';

// Neynar client for posting replies
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { getConfig } from 'src/security/config';

export interface CastWorkoutData {
  // Core fields that match RunningSession model
  distance?: number; // in km
  duration?: number; // in minutes
  reasoning?: string; // LLM reasoning for data extraction

  confidence: number; // 0-1 confidence score
  isWorkoutImage?: boolean; // indicates if this is actually a workout

  // Additional fields that can be extracted from casts
  completedDate?: string; // ISO string
}

export interface FarcasterCastData {
  hash: string;
  timestamp: string;
  text: string;
  thread_hash: string;
  parent_hash: string | null;
  parent_url: string | null;
  root_parent_url: string | null;
  author: {
    object: string;
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    custody_address: string;
    profile: any;
    follower_count: number;
    following_count: number;
    verifications: string[];
    power_badge?: boolean;
    score?: number;
  };
  app?: {
    object: string;
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    custody_address: string;
  };
  channel?: {
    object: string;
    id: string;
    name: string;
    image_url: string;
  };
  embeds: Array<{
    url: string;
    metadata?: any;
  }>;
  reactions: {
    likes_count: number;
    recasts_count: number;
    likes: any[];
    recasts: any[];
  };
  replies: {
    count: number;
  };
  mentioned_profiles: any[];
  mentioned_profiles_ranges: any[];
  mentioned_channels: any[];
  mentioned_channels_ranges: any[];
  author_channel_context?: {
    role: string;
    following: boolean;
  };
  event_timestamp?: string;
}

@Injectable()
export class CastProcessorService {
  private readonly logger = new Logger(CastProcessorService.name);
  private readonly openai: OpenAI;
  private readonly neynarClient: NeynarAPIClient;
  private readonly config = getConfig();

  // Fun messages for different types of non-workout images
  private readonly funMessages = [
    "🏃‍♂️ That's a great photo, but I was expecting to see some running stats! Try uploading a screenshot from your running app instead.",
    '📱 Looks like you sent the wrong screenshot! I need to see your workout data from apps like Strava, Nike Run Club, or Garmin.',
    "🤔 I can see the image, but it doesn't look like a running app screenshot. Show me those sweet running stats!",
    "🏃‍♀️ Nice picture! But I'm specifically looking for workout screenshots with distance, time, and pace data.",
    "📊 That image doesn't contain any workout data I can recognize. Try sharing a screenshot from your fitness app!",
    '🎯 Almost there! I need screenshots that show running metrics like distance, pace, and time from your running app.',
    "🏃 I see what you uploaded, but it's not a workout screenshot. Let's see those running achievements!",
    "📸 Great photo, but I'm hunting for running data! Upload a screenshot from your fitness tracking app.",
  ];

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
    // Note: FarcasterCast repository removed as model has been deleted
    // @InjectRepository(FarcasterCast)
    // private readonly farcasterCastRepository: Repository<FarcasterCast>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize Neynar client
    const config = new Configuration({
      apiKey: process.env.NEYNAR_API_KEY,
      baseOptions: {
        headers: {
          'x-neynar-experimental': true,
        },
      },
    });
    this.neynarClient = new NeynarAPIClient(config);
  }

  async replyToCast(
    castData: FarcasterCastData,
    result: CastWorkoutData,
  ): Promise<any> {
    try {
      console.log('INSIDE THE REPLY TO CAST FUNCTION', castData.hash);
      // Generate simple reply with distance and time
      const distance = result.distance ? `${result.distance}km` : 'distance';
      const time = result.duration ? `${result.duration} minutes` : 'time';

      const replyText = `Great run! A ${distance} session in ${time} has been saved to your running history. Keep it up! 🏃‍♂️\n\nEach week, the top 8 runners split 100% of the $runner share of trading fees—12.5% each, based on distance logged.`;

      // Post reply to Farcaster
      const reply = await this.postReplyToFarcaster(
        castData.hash,
        replyText,
        uuidv4(),
      );

      return {
        success: true,
        replyText: replyText,
        replyHash: reply?.hash,
        message: 'Reply posted successfully',
      };
    } catch (error) {
      console.error('❌ Error replying to cast:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to reply to cast',
      };
    }
  }

  async sendRunCompletedNotification(
    castData: FarcasterCastData,
    workoutData: CastWorkoutData,
  ): Promise<void> {
    try {
      const username = castData.author.username;
      const distance = workoutData.distance
        ? `${workoutData.distance}km`
        : 'Unknown distance';
      const duration = workoutData.duration
        ? this.formatDuration(workoutData.duration)
        : 'Unknown time';

      const notification = {
        title: `@${username} just ran`,
        body: `${distance} on ${duration}!`,
        target_url: `https://runnercoin.lat/cast/${castData.hash}`,
      };

      // Send notification to all users (empty array means all users with notifications enabled)
      const result = await this.neynarClient.publishFrameNotifications({
        targetFids: [], // Empty array targets all users with notifications enabled
        notification,
      });
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      // Don't throw error to avoid disrupting the main cast processing flow
    }
  }

  private formatDuration(minutes: number): string {
    const totalMinutes = Math.floor(minutes);
    const seconds = Math.floor((minutes - totalMinutes) * 60);

    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const remainingMinutes = totalMinutes % 60;
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${totalMinutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  private async generateEncouragingReply(
    castData: FarcasterCastData,
    workoutData: CastWorkoutData,
  ): Promise<string> {
    try {
      // Gather comprehensive user context
      const userContext = await this.gatherUserContext(
        castData.author.fid,
        workoutData,
      );

      // Create contextual prompt
      const contextualPrompt = this.createContextualPrompt(
        castData,
        workoutData,
        userContext,
      );

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: this.getSystemPromptForPersonalizedReply(userContext),
          },
          {
            role: 'user',
            content: contextualPrompt,
          },
        ],
        temperature: 0.7,
      });

      const replyText = response.choices[0]?.message?.content?.trim();

      if (!replyText) {
        throw new Error('No reply generated');
      }

      return replyText;
    } catch (error) {
      console.error('❌ Error generating reply:', error);

      // Fallback reply
      const fallbackReply = this.generateFallbackReply(workoutData);
      return fallbackReply;
    }
  }

  private async gatherUserContext(
    fid: number,
    workoutData: CastWorkoutData,
  ): Promise<any> {
    try {
      // Find user with available relationships
      const user = await this.userRepository.findOne({
        where: { fid },
        relations: ['runningSessions'],
      });

      if (!user) {
        return { isNewUser: true, username: 'runner' };
      }

      // Get recent running sessions (last 30 days)
      const recentSessions = await this.runningSessionRepository.find({
        where: { user: { fid: user.fid } },
        order: { createdAt: 'DESC' },
        take: 10,
      });

      // Calculate streak information
      const streakInfo = this.calculateCurrentStreak(recentSessions);

      // Note: achievements have been removed from User model
      // Get recent achievements (last 30 days)
      const recentAchievements = [];

      // Determine user's running pattern and progress
      const runningPattern = this.analyzeRunningPattern(recentSessions);
      const personalRecords = this.identifyPersonalRecords(
        recentSessions,
        workoutData,
      );

      return {
        isNewUser: false,
        user: {
          username: user.username,
          totalRuns: user.totalRuns,
          totalDistance: user.totalDistance,
          totalTimeMinutes: user.totalTimeMinutes,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
        },
        stats: null,
        recentSessions: recentSessions.slice(0, 5).map((session) => ({
          distanceMeters: session.distanceMeters,
          duration: session.duration,
          createdAt: session.createdAt,
          status: session.status,
          castHash: session.castHash,
        })),
        recentAchievements,
        streakInfo,
        runningPattern,
        personalRecords,
      };
    } catch (error) {
      console.error('❌ Error gathering user context:', error);
      return { isNewUser: true, username: 'runner' };
    }
  }

  private calculateCurrentStreak(sessions: any[]): any {
    if (!sessions || sessions.length === 0) {
      return { currentStreak: 0, streakType: 'none' };
    }

    // Sort by date descending
    const sortedSessions = sessions.sort(
      (a, b) =>
        new Date(b.completedDate).getTime() -
        new Date(a.completedDate).getTime(),
    );

    let currentStreak = 0;
    let lastDate = new Date();

    for (const session of sortedSessions) {
      const sessionDate = new Date(session.completedDate);
      const daysDiff = Math.floor(
        (lastDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff <= 1) {
        currentStreak++;
        lastDate = sessionDate;
      } else {
        break;
      }
    }

    return {
      currentStreak,
      streakType:
        currentStreak >= 7
          ? 'strong'
          : currentStreak >= 3
            ? 'building'
            : 'starting',
      daysSinceLastRun: Math.floor(
        (new Date().getTime() -
          new Date(sortedSessions[0].completedDate).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    };
  }

  private analyzeRunningPattern(sessions: any[]): any {
    if (!sessions || sessions.length < 3) {
      return { pattern: 'new', consistency: 'irregular' };
    }

    const totalDistance = sessions.reduce(
      (sum, s) => sum + (s.distance || 0),
      0,
    );
    const avgDistance = totalDistance / sessions.length;
    const avgDuration =
      sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length;

    // Determine running pattern
    const runsPerWeek = sessions.length / 4; // assuming last 4 weeks
    let pattern = 'casual';
    let consistency = 'irregular';

    if (runsPerWeek >= 5) {
      pattern = 'dedicated';
      consistency = 'excellent';
    } else if (runsPerWeek >= 3) {
      pattern = 'regular';
      consistency = 'good';
    } else if (runsPerWeek >= 1) {
      pattern = 'casual';
      consistency = 'moderate';
    }

    return {
      pattern,
      consistency,
      avgDistance: Math.round(avgDistance * 100) / 100,
      avgDuration: Math.round(avgDuration),
      runsPerWeek: Math.round(runsPerWeek * 10) / 10,
    };
  }

  private identifyPersonalRecords(
    sessions: any[],
    currentWorkout: CastWorkoutData,
  ): any {
    if (!sessions || sessions.length === 0) {
      return { isNewPR: true, prType: 'first_run' };
    }

    const currentDistance = currentWorkout.distance || 0;
    const currentDuration = currentWorkout.duration || 0;

    // Check for distance PR
    const maxDistance = Math.max(...sessions.map((s) => s.distance || 0));
    const isDistancePR = currentDistance > maxDistance;

    // Check for duration PR
    const maxDuration = Math.max(...sessions.map((s) => s.duration || 0));
    const isDurationPR = currentDuration > maxDuration;

    return {
      isNewPR: isDistancePR || isDurationPR,
      prType: isDistancePR ? 'distance' : isDurationPR ? 'duration' : 'none',
      distanceImprovement: isDistancePR
        ? (((currentDistance - maxDistance) / maxDistance) * 100).toFixed(1)
        : null,
      durationImprovement: isDurationPR
        ? (((currentDuration - maxDuration) / maxDuration) * 100).toFixed(1)
        : null,
    };
  }

  private paceToMinutes(pace: string): number {
    const match = pace.match(/(\d+):(\d+)/);
    if (!match) return 999;
    return parseInt(match[1]) + parseInt(match[2]) / 60;
  }

  private getSystemPromptForPersonalizedReply(userContext: any): string {
    const personality = userContext.user?.coachPersonality || 'motivational';
    const fitnessLevel = userContext.user?.fitnessLevel || 'beginner';

    let basePrompt = `You are a data analyst for runners. No emojis. Speak directly with facts and numbers.`;

    if (personality === 'motivational') {
      basePrompt += ` Highlight achievements and trends.`;
    } else if (personality === 'supportive') {
      basePrompt += ` Focus on positive trends and growth.`;
    } else if (personality === 'strict') {
      basePrompt += ` Focus on performance gaps and improvements.`;
    }

    basePrompt += ` Fitness level: ${fitnessLevel}.`;

    return (
      basePrompt +
      `
  
  Rules:
  - Max 280 characters
  - Lead with data insights
  - Use their actual numbers
  - Compare to benchmarks when relevant
  - Highlight trends or patterns
  - No generic motivation
  - Everything must be specific to their data`
    );
  }

  private createContextualPrompt(
    castData: FarcasterCastData,
    workoutData: CastWorkoutData,
    userContext: any,
  ): string {
    const {
      user,
      stats,
      recentSessions,
      streakInfo,
      runningPattern,
      personalRecords,
    } = userContext;

    if (userContext.isNewUser) {
      return `Analyze this first-time runner's debut performance and create a data-driven welcome:
  - Distance: ${workoutData.distance || 'N/A'}km
  - Duration: ${workoutData.duration || 'N/A'} minutes  
  - Their message: "${castData.text || ''}"
  
  Focus on what their debut numbers reveal about their potential. Compare to typical beginner baselines. Make them curious about tracking their progression.`;
    }

    let prompt = `Analyze this runner's performance using comprehensive data context and create a compelling data story:
  
  CURRENT WORKOUT ANALYSIS:
  - Distance: ${workoutData.distance || 'N/A'}km
  - Duration: ${workoutData.duration || 'N/A'} minutes
  - User's message: "${castData.text || ''}"
  
  RUNNER'S PERFORMANCE PROFILE:
  - Username: @${user.username}
  - Total runs: ${user.totalRuns || 0} (career data point)
  - Total distance: ${user.totalDistance || 0}km (lifetime achievement)
  - Current streak: ${user.currentStreak || 0} days
  - Longest streak: ${user.longestStreak || 0} days
  - Fitness level: ${user.fitnessLevel}
  - Days since last run: ${streakInfo.daysSinceLastRun || 0}`;

    if (stats) {
      prompt += `
  
  PERFORMANCE METRICS:
  - This week: ${stats.thisWeekRuns} runs, ${stats.thisWeekDistance}km
  - This month: ${stats.thisMonthRuns} runs total
  - Personal best pace: ${stats.bestPace || 'N/A'} min/km
  - Longest distance: ${stats.longestRun || 'N/A'}km
  - Average run length: ${stats.avgRunDistance || 'N/A'}km
  - Weekly consistency: ${stats.weeklyConsistencyScore || 'N/A'}%`;
    }

    prompt += `
  
  PATTERN ANALYSIS:
  - Running pattern: ${runningPattern.pattern} runner (${runningPattern.runsPerWeek} runs/week average)
  - Consistency rating: ${runningPattern.consistency}
  - Average distance per run: ${runningPattern.avgDistance}km
  - Average duration per run: ${runningPattern.avgDuration} minutes`;

    if (personalRecords.isNewPR) {
      prompt += `
  
  PERSONAL RECORD ALERT:
  - NEW PR TYPE: ${personalRecords.prType}
  - Distance improvement: ${personalRecords.distanceImprovement || 'N/A'}%
  - Duration improvement: ${personalRecords.durationImprovement || 'N/A'}%
  This is a breakthrough performance that deserves data-driven recognition.`;
    }

    if (streakInfo.streakType === 'strong') {
      prompt += `
  
  STREAK ANALYSIS: Currently on a ${streakInfo.currentStreak}-day streak - this puts them in elite consistency territory.`;
    } else if (streakInfo.streakType === 'building') {
      prompt += `
  
  MOMENTUM TRACKING: ${streakInfo.currentStreak}-day streak building - consistency patterns are forming.`;
    }

    if (recentSessions.length > 0) {
      prompt += `
  
  RECENT PERFORMANCE TREND (last 5 runs):`;
      recentSessions.forEach((session, index) => {
        prompt += `
  ${index + 1}. ${session.distance}km in ${session.duration}min (${session.pace}) - ${session.completedDate}`;
      });
    }

    prompt += `
  
  DATA STORYTELLING MISSION:
  Create a response that:
  0. Is no more than 280 characters
  1. Leads with the most fascinating data insight from this run
  2. Puts their performance in context using their historical data
  3. Compares to relevant benchmarks or patterns when available
  4. Identifies what makes this specific run noteworthy
  5. Uses concrete numbers and trends to build the narrative
  6. Makes them curious about their own progression patterns
  7. Encourages continued data collection (more runs = better insights)
  8. Uses their username naturally but sparingly
  9. No generic motivation - everything must be anchored in their actual performance data
  
  Remember: You're not cheering them on, you're revealing what their data says about their running story.`;

    return prompt;
  }

  private generateFallbackReply(workoutData: CastWorkoutData): string {
    const distance = workoutData.distance;
    const duration = workoutData.duration;

    // Even fallback replies should be data-focused, not motivational
    if (distance && duration) {
      return `${distance}km in ${duration}min logged. That's ${(duration / distance).toFixed(1)} minutes per kilometer - good baseline for tracking progression.`;
    } else if (distance) {
      return `${distance}km distance recorded. Each run adds to your performance dataset - consistency builds patterns.`;
    } else {
      return `Workout logged. More detailed data in future runs will unlock better insights about your progression patterns.`;
    }
  }

  private async postReplyToFarcaster(
    parentCastHash: string,
    replyText: string,
    idempotencyKey: string,
  ): Promise<any> {
    try {
      const signerUuid = process.env.NEYNAR_SIGNER_UUID;

      if (!signerUuid) {
        throw new Error('NEYNAR_SIGNER_UUID not configured');
      }
      // Post reply using Neynar API
      const reply = await this.neynarClient.publishCast({
        signerUuid,
        text: replyText,
        parent: parentCastHash,
        idem: idempotencyKey,
        embeds: [
          {
            url: `https://runner-miniapp-backend-production.up.railway.app/embeds/run/${parentCastHash}`,
          },
        ],
      });

      return reply;
    } catch (error) {
      console.error('❌ Error posting reply:', error);
      throw error;
    }
  }

  async processCast(castData: FarcasterCastData): Promise<CastWorkoutData> {
    try {
      this.logger.log(`Processing cast ${castData.hash} with GPT-4 Vision`);

      // Filter image embeds
      const imageEmbeds = castData.embeds.filter(
        (embed) =>
          embed.url &&
          (embed.url.includes('imagedelivery.net') ||
            embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
            (embed.metadata &&
              embed.metadata.content_type &&
              embed.metadata.content_type.startsWith('image/'))),
      );

      // Convert image URLs to base64
      const base64Images = [];

      for (let i = 0; i < imageEmbeds.length; i++) {
        const embed = imageEmbeds[i];

        const base64 = await this.urlToBase64(embed.url);
        if (base64) {
          base64Images.push(base64);
        } else {
        }
      }

      // Extract workout data using GPT-4 Vision
      const extractedData = await this.extractWorkoutDataFromImages(
        base64Images,
        castData,
      );
      console.log(
        'THE EXTRACTED DATA FOR HASH IS',
        castData.hash,
        extractedData,
      );
      console.log('THE IS WORKOUT IMAGE IS', extractedData.isWorkoutImage);
      // Check if this wasn't a workout image
      if (!extractedData.isWorkoutImage) {
        this.logger.log('📷 Non-workout image detected, returning fun message');
        return {
          ...extractedData,
        };
      }

      this.logger.log(
        `Successfully extracted workout data with ${Math.round(extractedData.confidence * 100)}% confidence`,
      );

      // Note: Database saving is now handled by SocialService to prevent race conditions
      // Only handle reply generation here
      if (extractedData.isWorkoutImage) {
        // Reply to the cast with encouragement
        await this.replyToCast(castData, extractedData);

        // Send notification to all users about the completed run
        await this.sendRunCompletedNotification(castData, extractedData);
      }

      // Return result in the format expected by the SocialService
      return {
        ...extractedData,
      };
    } catch (error) {
      console.error('❌ Cast processing failed:', error);
      this.logger.error('Failed to process cast:', error);
      throw new Error(`Cast processing failed: ${error.message}`);
    }
  }

  private async urlToBase64(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(
          `   ❌ HTTP error ${response.status}: ${response.statusText} for ${url}`,
        );
        return null;
      }

      const contentType = response.headers.get('content-type');

      if (contentType && !contentType.startsWith('image/')) {
        console.error(
          `   ❌ Not an image content type: ${contentType} for ${url}`,
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      return base64;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`Request timeout for ${url}`);
      } else {
        console.error(`Failed to convert ${url} to base64:`, error.message);
      }
      return null;
    }
  }

  private async extractWorkoutDataFromImages(
    base64Images: string[],
    castData: FarcasterCastData,
  ): Promise<CastWorkoutData> {
    // Try primary prompt first
    const extractedData = await this.tryExtractWithPrompt(
      base64Images,
      castData,
      PROMPT_THREE,
      'primary',
    );

    // Check if reasoning is missing and data extraction was successful
    if (
      extractedData.isWorkoutImage &&
      (!extractedData.reasoning || extractedData.reasoning.trim().length < 20)
    ) {
      const fallbackData = await this.tryExtractWithPrompt(
        base64Images,
        castData,
        PROMPT_THREE_FALLBACK,
        'fallback',
      );

      // Use fallback data if it has better reasoning
      if (
        fallbackData.reasoning &&
        fallbackData.reasoning.trim().length >= 20
      ) {
        return fallbackData;
      }
    }

    return extractedData;
  }

  private async tryExtractWithPrompt(
    base64Images: string[],
    castData: FarcasterCastData,
    systemPrompt: string,
    promptType: string,
  ): Promise<CastWorkoutData> {
    try {
      const imageEmbeds = castData.embeds.filter(
        (embed) =>
          embed.url &&
          (embed.url.includes('imagedelivery.net') ||
            embed.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
            (embed.metadata &&
              embed.metadata.content_type &&
              embed.metadata.content_type.startsWith('image/'))),
      );

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze the following cast. Understand by its context if the user is sharing a specific running or walking session, or something different.  Return only valid JSON. The cast text is: ${castData.text}. It has ${castData.embeds.length} embeds, out of which ${imageEmbeds.length} are images.`,
              },
              ...base64Images.map((image) => ({
                type: 'image_url' as const,
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                  detail: 'high' as const,
                },
              })),
            ],
          },
        ],
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const content = response.choices[0]?.message?.content;
      console.log('THE CONTENT FOR HASH IS', castData.hash, content);

      if (!content) {
        console.error(`No content in GPT-4 Vision response (${promptType})`);
        throw new Error(`No response from GPT-4 Vision (${promptType})`);
      }

      // Clean the response to ensure it's valid JSON
      const cleanedContent = content.trim();
      const jsonStart = cleanedContent.indexOf('{');
      const jsonEnd = cleanedContent.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        console.error(`Invalid JSON structure in response (${promptType})`);
        throw new Error(
          `Invalid JSON response from GPT-4 Vision (${promptType})`,
        );
      }

      const jsonString = cleanedContent.substring(jsonStart, jsonEnd + 1);

      // Parse the JSON response
      const extractedData: CastWorkoutData = JSON.parse(jsonString);

      // Check if this is not a workout image
      if (extractedData.isWorkoutImage === false) {
        return {
          isWorkoutImage: false,
          confidence: 0,
          reasoning: extractedData.reasoning || 'Not a workout image',
        };
      }

      // Validate and sanitize the extracted data for workout images
      return this.validateExtractedData(extractedData);
    } catch (error) {
      console.error(`GPT-4 Vision API error (${promptType}):`, error);
      this.logger.error(`GPT-4 Vision API error (${promptType}):`, error);

      // Return a fallback response with low confidence
      return {
        isWorkoutImage: true, // Assume it was a workout attempt
        confidence: 0,
        reasoning: `Failed to extract with ${promptType} prompt: ${error.message}`,
      };
    }
  }

  private getRandomFunMessage(): string {
    const randomIndex = Math.floor(Math.random() * this.funMessages.length);
    return this.funMessages[randomIndex];
  }

  private validateExtractedData(data: any): CastWorkoutData {
    const validated: CastWorkoutData = {
      isWorkoutImage: true,
      confidence: 0,
    };

    // Validate numeric fields
    if (
      typeof data.distance === 'number' &&
      data.distance > 0 &&
      data.distance < 500
    ) {
      validated.distance = Math.round(data.distance * 100) / 100; // Round to 2 decimals
    }

    if (
      typeof data.duration === 'number' &&
      data.duration > 0 &&
      data.duration < 600
    ) {
      validated.duration = Math.round(data.duration * 10) / 10; // Round to 1 decimal
    }

    // Validate reasoning
    if (
      typeof data.reasoning === 'string' &&
      data.reasoning.trim().length > 0
    ) {
      validated.reasoning = data.reasoning.trim();
    }

    // Validate completedDate
    if (
      typeof data.completedDate === 'string' &&
      data.completedDate.length > 0
    ) {
      try {
        const date = new Date(data.completedDate);
        if (!isNaN(date.getTime())) {
          validated.completedDate = data.completedDate;
        }
      } catch (e) {
        console.warn('Invalid completed date format');
      }
    }

    // Validate confidence
    if (
      typeof data.confidence === 'number' &&
      data.confidence >= 0 &&
      data.confidence <= 1
    ) {
      validated.confidence = Math.round(data.confidence * 100) / 100;
    } else {
      // Calculate confidence based on how much data we extracted
      let dataPoints = 0;
      const maxPoints = 10;

      if (validated.distance) dataPoints++;
      if (validated.duration) dataPoints++;
      if (validated.reasoning) dataPoints += 2; // Reasoning worth 2 points
      if (validated.completedDate) dataPoints++;

      validated.confidence = Math.min(dataPoints / maxPoints, 0.9); // Max 90% confidence
    }

    return validated;
  }

  private async saveWorkoutToDatabase(
    castData: FarcasterCastData,
    workoutData: CastWorkoutData,
  ): Promise<void> {
    try {
      // Find or create user
      let user = await this.userRepository.findOne({
        where: { fid: castData.author.fid },
      });

      if (!user) {
        user = this.userRepository.create({
          fid: castData.author.fid,
          username: castData.author.username,
          pfpUrl: castData.author.pfp_url,
          role: UserRoleEnum.USER,
          notificationsEnabled: true,
          totalRuns: 0,
          totalDistance: 0,
          totalTimeMinutes: 0,
          lastActiveAt: new Date(),
        });
        user = await this.userRepository.save(user);
      }

      const completedDate = new Date(castData.timestamp);

      // Create RunningSession
      const runningSession = this.runningSessionRepository.create({
        user: user, // Use relation instead of userId
        fid: user.fid,
        distanceMeters: Number(workoutData.distance || 0) * 1000, // Convert to meters
        duration: Number(workoutData.duration || 0),
        reasoning: workoutData.reasoning || null,
        castHash: castData.hash,
      });

      await this.runningSessionRepository.save(runningSession);

      // Update user stats
      user.totalRuns = Number(user.totalRuns) + 1;
      user.totalDistance =
        Number(user.totalDistance) + Number(workoutData.distance || 0);
      user.totalTimeMinutes =
        Number(user.totalTimeMinutes) + Number(workoutData.duration || 0);
      // Note: These properties have been removed from User model
      // user.totalShares = Number(user.totalShares || 0) + 1;
      // user.totalLikes = Number(user.totalLikes || 0) + Number(castData.reactions.likes_count || 0);
      // user.lastRunDate = completedDate;
      user.lastActiveAt = completedDate;

      await this.userRepository.save(user);
    } catch (error) {
      console.error('❌ Error saving workout to database:', error);
      throw error;
    }
  }

  /**
   * Health check for the cast processor
   */
  async healthCheck(): Promise<{ status: string; model: string }> {
    try {
      // Test with a simple request
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Test',
          },
        ],
      });

      return {
        status: response ? 'healthy' : 'unhealthy',
        model: 'gpt-4o-mini',
      };
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.logger.error('Cast processor health check failed:', error);
      return {
        status: 'unhealthy',
        model: 'gpt-4o-mini',
      };
    }
  }
}
