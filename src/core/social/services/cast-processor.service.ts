// src/core/social/services/cast-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { InjectRepository } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { User } from '../../../models/User/User.model';
import { UserRoleEnum } from '../../../models/User/User.types';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';
import { UnitType } from '../../../models/RunningSession/RunningSession.model';

// Neynar client for posting replies
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';

export interface CastWorkoutData {
  // Core fields that match RunningSession model
  distance?: number; // in km
  duration?: number; // in minutes
  pace?: string; // format: "mm:ss/km" or "mm:ss/mi"
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  confidence: number; // 0-1 confidence score
  extractedText?: string[]; // raw OCR text for debugging
  isWorkoutImage?: boolean; // indicates if this is actually a workout
  errorMessage?: string; // fun message for non-workout images

  // Additional fields that can be extracted from casts
  units?: 'km' | 'mi'; // distance units
  completedDate?: string; // ISO string

  // Added for interval/advanced support
  intervals?: any[]; // Array of interval objects (type can be refined)
  elevationGain?: number;
  steps?: number;
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

const PROMPT_TWO = `You are an expert at analyzing running app screenshots and extracting comprehensive workout data. You must be extremely careful with JSON formatting.

CRITICAL INSTRUCTIONS:
1. First determine if these are workout screenshots from running/fitness apps
2. If NOT workout screenshots, return the simple non-workout JSON
3. If YES workout screenshots, extract ALL visible data with perfect JSON formatting
4. NEVER use comments (//) in JSON - they break parsing
5. ALWAYS use double quotes for strings
6. ALWAYS end objects and arrays with proper closing brackets

NON-WORKOUT RESPONSE (for random photos, memes, food, etc.):
{
  "isWorkoutImage": false,
  "confidence": 0,
  "errorMessage": "not_workout_image"
}

WORKOUT RESPONSE (extract ALL visible data):
{
  "isWorkoutImage": true,
  "distance": 12.95,
  "duration": 67.38,
  "units": "km",
  "pace": "5:12/km",
  "calories": 1025,
  "elevationGain": 150,
  "avgHeartRate": 147,
  "maxHeartRate": 186,
  "date": "2025-06-10",
  "intervals": [
    {
      "number": 1,
      "type": "warmup",
      "distance": 1.5,
      "duration": "7:30",
      "pace": "5:00/km"
    },
    {
      "number": 2,
      "type": "work",
      "distance": 3.2,
      "duration": "16:00",
      "pace": "5:00/km"
    },
    {
      "number": 3,
      "type": "recovery",
      "distance": 0.8,
      "duration": "4:00",
      "pace": "5:00/km"
    },
    {
      "number": 4,
      "type": "work",
      "distance": 3.2,
      "duration": "16:00",
      "pace": "5:00/km"
    },
    {
      "number": 5,
      "type": "cooldown",
      "distance": 4.25,
      "duration": "23:48",
      "pace": "5:36/km"
    }
  ],
  "confidence": 0.95,
  "extractedText": [
    "12.95 km",
    "1:07:23",
    "5:12/km average pace",
    "147 bpm average",
    "180 spm cadence"
  ]
}

DETAILED EXTRACTION GUIDELINES:

BASIC METRICS:
- distance: Convert to km (miles × 1.609)
- duration: Total minutes (1:07:23 = 67.38 minutes)
- pace: Format as "X:XX/km" (convert from /mile by dividing by 1.609)
- calories: Exact number if visible
- elevation: Convert to meters (feet × 0.3048)

INTERVALS DETECTION:
Look for these patterns to identify structured workouts:
1. Multiple segments with similar distances (like 3.2km + 3.2km)
2. Pace variations showing work/rest patterns
3. Time markers showing regular patterns
4. Different pace targets for different segments

For each interval, if you see them, determine:
- type: "warmup", "work", "recovery", "cooldown", "tempo", "threshold"
- distance: Segment distance in km
- duration: Time as "MM:SS" format
- pace: Average pace for that segment

CONFIDENCE SCORING:
- 0.9-1.0: Clear running app with all major metrics visible
- 0.5-0.8: Running app with some metrics visible
- 0.0-0.4: Not a workout or very unclear

CRITICAL JSON RULES:
1. NO trailing commas in objects or arrays
2. NO comments with // or /* */
3. ALL strings must use double quotes
4. Numbers without quotes (12.95 not "12.95")
5. Booleans as true/false (not "true"/"false")
6. Arrays with proper square brackets []
7. Objects with proper curly braces {}

Return ONLY the JSON object with no additional text.`;

@Injectable()
export class CastProcessorService {
  private readonly logger = new Logger(CastProcessorService.name);
  private readonly openai: OpenAI;
  private readonly neynarClient: NeynarAPIClient;

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
    @InjectRepository(FarcasterCast)
    private readonly farcasterCastRepository: Repository<FarcasterCast>,
  ) {
    console.log('🔧 Initializing CastProcessorService');
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

    console.log('✅ OpenAI client initialized');
    console.log('✅ Neynar client initialized');
  }

  async replyToCast(castData: FarcasterCastData, result: any): Promise<any> {
    try {
      console.log('🔍 Creating encouraging reply to cast');

      // Generate encouraging reply using AI
      const replyText = await this.generateEncouragingReply(castData, result);

      if (!replyText) {
        console.log('❌ Failed to generate reply text');
        return { message: 'Failed to generate reply' };
      }

      // Post reply to Farcaster
      const reply = await this.postReplyToFarcaster(
        castData.hash,
        replyText,
        uuidv4(),
      );

      console.log('✅ Successfully replied to cast');
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

  private async generateEncouragingReply(
    castData: FarcasterCastData,
    workoutData: CastWorkoutData,
  ): Promise<string> {
    try {
      console.log('🤖 Generating encouraging reply using AI with user context');

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

      console.log('✅ Generated personalized reply:', replyText);
      return replyText;
    } catch (error) {
      console.error('❌ Error generating reply:', error);

      // Fallback reply
      const fallbackReply = this.generateFallbackReply(workoutData);
      console.log('📝 Using fallback reply:', fallbackReply);
      return fallbackReply;
    }
  }

  private async gatherUserContext(
    fid: number,
    workoutData: CastWorkoutData,
  ): Promise<any> {
    try {
      console.log('📊 Gathering comprehensive user context for FID:', fid);

      // Find user with all relevant relationships
      const user = await this.userRepository.findOne({
        where: { fid },
        relations: [
          'detailedStats',
          'achievements',
          'runningSessions',
          'coachInteractions',
          'farcasterCasts',
        ],
      });

      if (!user) {
        console.log('👤 User not found, using basic context');
        return { isNewUser: true, username: 'runner' };
      }

      // Get recent running sessions (last 30 days)
      const recentSessions = await this.runningSessionRepository.find({
        where: { userId: user.id },
        order: { completedDate: 'DESC' },
        take: 10,
      });

      // Calculate streak information
      const streakInfo = this.calculateCurrentStreak(recentSessions);

      // Get recent achievements (last 30 days)
      const recentAchievements =
        user.achievements?.filter(
          (achievement) =>
            achievement.earnedAt &&
            new Date(achievement.earnedAt) >
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        ) || [];

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
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
          fitnessLevel: user.fitnessLevel,
          coachPersonality: user.coachPersonality,
          lastRunDate: user.lastRunDate,
          preferredWeeklyFrequency: user.preferredWeeklyFrequency,
        },
        stats: user.detailedStats
          ? {
              thisWeekRuns: user.detailedStats.thisWeekRuns,
              thisWeekDistance: user.detailedStats.thisWeekDistance,
              thisMonthRuns: user.detailedStats.thisMonthRuns,
              bestPace: user.detailedStats.bestPace,
              longestRun: user.detailedStats.longestRun,
              avgRunDistance: user.detailedStats.avgRunDistance,
              planCompletionRate: user.detailedStats.planCompletionRate,
              weeklyConsistencyScore: user.detailedStats.weeklyConsistencyScore,
            }
          : null,
        recentSessions: recentSessions.slice(0, 5).map((session) => ({
          distance: session.distance,
          duration: session.duration,
          pace: session.pace,
          completedDate: session.completedDate,
          confidence: session.confidence,
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

    // Check for pace PR (if available)
    let isPacePR = false;
    if (currentWorkout.pace && sessions.some((s) => s.pace)) {
      const currentPaceMinutes = this.paceToMinutes(currentWorkout.pace);
      const bestPaceMinutes = Math.min(
        ...sessions
          .filter((s) => s.pace)
          .map((s) => this.paceToMinutes(s.pace)),
      );
      isPacePR = currentPaceMinutes < bestPaceMinutes;
    }

    return {
      isNewPR: isDistancePR || isDurationPR || isPacePR,
      prType: isDistancePR
        ? 'distance'
        : isDurationPR
          ? 'duration'
          : isPacePR
            ? 'pace'
            : 'none',
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

    let basePrompt = `You are a sharp, data-driven running analyst who tells compelling stories with numbers. You don't use emojis. You speak directly and factually, but with wit and edge. You're not a cheerleader - you're a data storyteller who reveals fascinating insights about performance.`;

    // Personality variations affect tone but not the core data-driven approach
    if (personality === 'motivational') {
      basePrompt += ` Your tone is energetic and you highlight impressive achievements and trends.`;
    } else if (personality === 'supportive') {
      basePrompt += ` Your tone is warm but still data-focused, emphasizing positive trends and growth.`;
    } else if (personality === 'strict') {
      basePrompt += ` Your tone is direct and analytical, focusing on performance gaps and areas for improvement.`;
    }

    basePrompt += ` The runner's fitness level is ${fitnessLevel}. Your responses should be contextually intelligent.`;

    return (
      basePrompt +
      `
  
  Key guidelines:
  - Maximum 280 characters (Farcaster limit)
  - Lead with fascinating data insights, not motivation
  - Compare their performance to community benchmarks when relevant
  - Highlight trends, improvements, or notable patterns
  - Use their actual numbers and achievements as the story
  - Make them curious about their own progress
  - No generic cheerleading - everything must be specific to their data
  - Focus on what makes this run interesting from a data perspective
  - Encourage through insight, not empty praise`
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
  - Pace: ${workoutData.pace || 'N/A'}
  - Their message: "${castData.text || ''}"
  
  Focus on what their debut numbers reveal about their potential. Compare to typical beginner baselines. Make them curious about tracking their progression.`;
    }

    let prompt = `Analyze this runner's performance using comprehensive data context and create a compelling data story:
  
  CURRENT WORKOUT ANALYSIS:
  - Distance: ${workoutData.distance || 'N/A'}km
  - Duration: ${workoutData.duration || 'N/A'} minutes
  - Pace: ${workoutData.pace || 'N/A'}
  - Calories: ${workoutData.calories || 'N/A'}
  - Heart Rate: ${workoutData.avgHeartRate || 'N/A'} bpm
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
    const pace = workoutData.pace;

    // Even fallback replies should be data-focused, not motivational
    if (distance && duration && pace) {
      return `${distance}km in ${duration}min at ${pace} pace. That's a ${((distance / duration) * 60).toFixed(1)} km/hour average speed. Solid data point for your running profile.`;
    } else if (distance && duration) {
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
      console.log('📤 Posting reply to Farcaster');
      console.log('   Parent cast:', parentCastHash);
      console.log('   Reply text:', replyText);

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
            url: 'https://runnercoin.lat',
          },
        ],
      });
      console.log('🔍 THE REPLY:', reply);

      console.log('✅ Reply posted successfully:', reply?.cast?.hash);
      return reply;
    } catch (error) {
      console.error('❌ Error posting reply:', error);
      throw error;
    }
  }

  async processCast(castData: FarcasterCastData): Promise<any> {
    try {
      console.log(
        `📸 Processing cast with ${castData.embeds?.length || 0} embeds`,
      );
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

      if (imageEmbeds.length === 0) {
        console.log('📝 No images found, returning non-workout');
        return {
          isWorkoutImage: false,
          confidence: 0,
          errorMessage: 'no_images_found',
          extractedText: ['No images in this cast'],
        };
      }

      // Convert image URLs to base64
      console.log('🔄 Converting image URLs to base64');
      const base64Images = [];

      for (let i = 0; i < imageEmbeds.length; i++) {
        const embed = imageEmbeds[i];
        console.log(`   📸 Processing embed ${i + 1}/${imageEmbeds.length}:`);
        console.log(`      URL: ${embed.url}`);

        const base64 = await this.urlToBase64(embed.url);
        if (base64) {
          base64Images.push(base64);
          console.log(`      ✅ Added to processing queue`);
        } else {
          console.log(`      ❌ Failed to convert, skipping`);
        }
      }

      console.log(
        `✅ Converted ${base64Images.length}/${imageEmbeds.length} images to base64`,
      );

      if (base64Images.length === 0) {
        console.log('❌ Failed to convert any images to base64');
        return {
          isWorkoutImage: false,
          confidence: 0,
          errorMessage: 'image_conversion_failed',
          extractedText: ['Failed to process images'],
        };
      }

      // Extract workout data using GPT-4 Vision
      console.log('🤖 Extracting workout data using GPT-4 Vision');
      const extractedData =
        await this.extractWorkoutDataFromImages(base64Images);

      console.log('📊 Extracted data:', JSON.stringify(extractedData, null, 2));

      // Check if this wasn't a workout image
      if (!extractedData.isWorkoutImage) {
        this.logger.log('📷 Non-workout image detected, returning fun message');
        return extractedData;
      }

      this.logger.log(
        `Successfully extracted workout data with ${Math.round(extractedData.confidence * 100)}% confidence`,
      );

      // If it's a workout, save to database and reply
      if (extractedData.isWorkoutImage && extractedData.confidence > 0.3) {
        await this.saveWorkoutToDatabase(castData, extractedData);

        // Reply to the cast with encouragement
        await this.replyToCast(castData, extractedData);
      }

      return extractedData;
    } catch (error) {
      console.error('❌ Cast processing failed:', error);
      this.logger.error('Failed to process cast:', error);
      throw new Error(`Cast processing failed: ${error.message}`);
    }
  }

  private async urlToBase64(url: string): Promise<string | null> {
    try {
      console.log(`   🔗 Fetching image from: ${url}`);

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
      console.log(`   📄 Content-Type: ${contentType}`);

      if (contentType && !contentType.startsWith('image/')) {
        console.error(
          `   ❌ Not an image content type: ${contentType} for ${url}`,
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      console.log(
        `   ✅ Successfully converted image (${buffer.length} bytes)`,
      );
      return base64;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`   ❌ Request timeout for ${url}`);
      } else {
        console.error(
          `   ❌ Failed to convert ${url} to base64:`,
          error.message,
        );
      }
      return null;
    }
  }

  private async extractWorkoutDataFromImages(
    base64Images: string[],
  ): Promise<CastWorkoutData> {
    console.log('🔍 Starting workout data extraction from images');
    const systemPrompt = PROMPT_TWO;

    try {
      console.log('🤖 Making API request to GPT-4 Vision');
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
                text: 'Analyze these running app screenshots. Extract comprehensive workout data with perfect JSON formatting. Return only valid JSON.',
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

      console.log('✅ Received response from GPT-4 Vision');
      const content = response.choices[0]?.message?.content;
      console.log('📄 GPT-4 Vision response:', content);

      if (!content) {
        console.error('❌ No content in GPT-4 Vision response');
        throw new Error('No response from GPT-4 Vision');
      }

      // Clean the response to ensure it's valid JSON
      console.log('🧹 Cleaning JSON response');
      const cleanedContent = content.trim();
      const jsonStart = cleanedContent.indexOf('{');
      const jsonEnd = cleanedContent.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('❌ Invalid JSON structure in response');
        throw new Error('Invalid JSON response from GPT-4 Vision');
      }

      const jsonString = cleanedContent.substring(jsonStart, jsonEnd + 1);

      // Parse the JSON response
      console.log('📝 Parsing JSON response');
      const extractedData: CastWorkoutData = JSON.parse(jsonString);

      // Check if this is not a workout image
      if (extractedData.isWorkoutImage === false) {
        console.log('📷 Non-workout image detected');
        return {
          isWorkoutImage: false,
          confidence: 0,
          errorMessage: this.getRandomFunMessage(),
          extractedText: ['Image does not contain workout data'],
        };
      }

      // Validate and sanitize the extracted data for workout images
      console.log('✨ Validating extracted workout data');
      return this.validateExtractedData(extractedData);
    } catch (error) {
      console.error('❌ GPT-4 Vision API error:', error);
      this.logger.error('GPT-4 Vision API error:', error);

      // Return a fallback response with low confidence
      return {
        isWorkoutImage: true, // Assume it was a workout attempt
        confidence: 0,
        extractedText: [`Error processing images: ${error.message}`],
      };
    }
  }

  private getRandomFunMessage(): string {
    const randomIndex = Math.floor(Math.random() * this.funMessages.length);
    return this.funMessages[randomIndex];
  }

  private validateExtractedData(data: any): CastWorkoutData {
    console.log('🔍 Starting data validation');
    const validated: CastWorkoutData = {
      isWorkoutImage: true,
      confidence: 0,
    };

    // Validate numeric fields
    console.log('📊 Validating numeric fields');
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

    if (
      typeof data.calories === 'number' &&
      data.calories > 0 &&
      data.calories < 5000
    ) {
      validated.calories = Math.round(data.calories);
    }

    if (
      typeof data.avgHeartRate === 'number' &&
      data.avgHeartRate > 30 &&
      data.avgHeartRate < 250
    ) {
      validated.avgHeartRate = Math.round(data.avgHeartRate);
    }

    if (
      typeof data.maxHeartRate === 'number' &&
      data.maxHeartRate > 30 &&
      data.maxHeartRate < 250
    ) {
      validated.maxHeartRate = Math.round(data.maxHeartRate);
    }

    // Validate string fields
    console.log('📝 Validating string fields');
    if (
      typeof data.pace === 'string' &&
      data.pace.length > 0 &&
      data.pace.length < 20
    ) {
      validated.pace = data.pace.trim();
    }

    // Validate units
    if (data.units === 'km' || data.units === 'mi') {
      validated.units = data.units;
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
        console.warn('⚠️ Invalid completed date format');
      }
    }

    // Validate confidence
    console.log('🎯 Calculating confidence score');
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
      if (validated.pace) dataPoints++;
      if (validated.calories) dataPoints++;
      if (validated.avgHeartRate) dataPoints++;
      if (validated.maxHeartRate) dataPoints++;
      if (validated.units) dataPoints++;
      if (validated.completedDate) dataPoints++;

      validated.confidence = Math.min(dataPoints / maxPoints, 0.9); // Max 90% confidence
    }

    // Store extracted text for debugging
    console.log('📝 Storing extracted text for debugging');
    if (Array.isArray(data.extractedText)) {
      validated.extractedText = data.extractedText
        .filter((text) => typeof text === 'string' && text.length > 0)
        .slice(0, 20); // Limit to 20 text snippets
    }

    console.log('✅ Data validation complete');
    return validated;
  }

  private async saveWorkoutToDatabase(
    castData: FarcasterCastData,
    workoutData: CastWorkoutData,
  ): Promise<void> {
    try {
      console.log('💾 Saving workout to database');

      // Find or create user
      let user = await this.userRepository.findOne({
        where: { fid: castData.author.fid },
      });

      if (!user) {
        console.log(`👤 Creating new user for FID: ${castData.author.fid}`);
        user = this.userRepository.create({
          fid: castData.author.fid,
          username: castData.author.username,
          pfpUrl: castData.author.pfp_url,
          role: UserRoleEnum.USER,
          notificationsEnabled: true,
          runnerTokens: 0,
          lifetimeTokensEarned: 0,
          tokensSpent: 0,
          totalRuns: 0,
          totalDistance: 0,
          totalTimeMinutes: 0,
          currentStreak: 0,
          longestStreak: 0,
          weeklyCompletions: 0,
          hasActiveTrainingPlan: false,
          hasCompletedOnboarding: true,
          unitPreference: 'metric',
          fitnessLevel: 'beginner',
          preferredWeeklyFrequency: 3,
          reminderTime: '07:00',
          timezone: 'UTC',
          coachPersonality: 'motivational',
          shareByDefault: true,
          privateProfile: false,
          lastActiveAt: new Date(),
        });
        user = await this.userRepository.save(user);
      }

      const completedDate = new Date(castData.timestamp);

      // Create RunningSession
      const runningSession = this.runningSessionRepository.create({
        userId: user.id,
        fid: user.fid,
        comment: castData.text,
        isWorkoutImage: true,
        distance: Number(workoutData.distance || 0),
        duration: Number(workoutData.duration || 0),
        units: workoutData.units === 'mi' ? UnitType.MI : UnitType.KM,
        pace:
          typeof workoutData.pace === 'string' ? workoutData.pace : '5:30/km',
        confidence: Number(workoutData.confidence || 0.8),
        extractedText: castData.text ? [castData.text] : [],
        completedDate: completedDate,
        createdAt: completedDate,
        calories: workoutData.calories || null,
        avgHeartRate: workoutData.avgHeartRate || null,
        maxHeartRate: workoutData.maxHeartRate || null,
        isPersonalBest: false,
        personalBestType: null,
        screenshotUrls: castData.embeds[0]?.url ? [castData.embeds[0].url] : [],
        rawText: castData.text,
        notes: castData.text,
        castHash: castData.hash,
      });

      const savedRunningSession =
        await this.runningSessionRepository.save(runningSession);

      // Create FarcasterCast
      const farcasterCast = this.farcasterCastRepository.create({
        userId: user.id,
        completedRunId: savedRunningSession.id,
        farcasterCastHash: castData.hash,
        imageUrl: castData.embeds[0]?.url || '',
        caption: castData.text,
        likes: Number(castData.reactions.likes_count || 0),
        comments: Number(castData.replies.count || 0),
        shares: Number(castData.reactions.recasts_count || 0),
      });

      await this.farcasterCastRepository.save(farcasterCast);

      // Update user stats
      user.totalRuns = Number(user.totalRuns) + 1;
      user.totalDistance =
        Number(user.totalDistance) + Number(workoutData.distance || 0);
      user.totalTimeMinutes =
        Number(user.totalTimeMinutes) + Number(workoutData.duration || 0);
      user.totalShares = Number(user.totalShares || 0) + 1;
      user.totalLikes =
        Number(user.totalLikes || 0) +
        Number(castData.reactions.likes_count || 0);
      user.lastRunDate = completedDate;
      user.lastActiveAt = completedDate;

      await this.userRepository.save(user);

      console.log('✅ Successfully saved workout to database');
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
      console.log('🏥 Running health check');
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

      console.log('✅ Health check successful');
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
