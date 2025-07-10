// src/core/social/services/cast-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { InjectRepository } from '@nestjs/typeorm';
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
  castHash: string;
  timestamp: string;
  text: string;
  author: {
    fid: number;
    username: string;
    pfp_url: string;
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

const REPLY_PROMPT = `You are an encouraging running coach who responds to workout posts on Farcaster. 

Create a short, motivating reply (max 280 characters) based on the workout data provided. The reply should:

1. Acknowledge their achievement
2. Highlight impressive metrics (pace, distance, duration, etc.)
3. Use encouraging and positive language
4. Include relevant emojis (running, fitness, achievement)
5. Keep it personal and supportive
6. Mention specific metrics from their workout

Example format:
"🔥 Amazing run! {distance}km in {duration}min at {pace} pace is incredible! Your consistency is inspiring. Keep pushing those limits! 💪"

Available workout data:
- Distance: {distance} km
- Duration: {duration} minutes  
- Pace: {pace}
- Calories: {calories}
- Heart rate: {heartRate} bpm
- User's original text: "{userText}"

Write a motivating reply that celebrates their achievement:`;

@Injectable()
export class CastProcessorService {
  private readonly logger = new Logger(CastProcessorService.name);
  private readonly openai: OpenAI;
  private readonly neynarClient: any;

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

      if (!result.isWorkoutImage || result.confidence < 0.3) {
        console.log('📝 Not a workout or low confidence, skipping reply');
        return { message: 'Not a workout, skipping reply' };
      }

      // Generate encouraging reply using AI
      const replyText = await this.generateEncouragingReply(castData, result);

      if (!replyText) {
        console.log('❌ Failed to generate reply text');
        return { message: 'Failed to generate reply' };
      }

      // Post reply to Farcaster
      const reply = await this.postReplyToFarcaster(
        castData.castHash,
        replyText,
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
      console.log('🤖 Generating encouraging reply using AI');

      const prompt = REPLY_PROMPT.replace(
        '{distance}',
        workoutData.distance?.toString() || 'N/A',
      )
        .replace('{duration}', workoutData.duration?.toString() || 'N/A')
        .replace('{pace}', workoutData.pace || 'N/A')
        .replace('{calories}', workoutData.calories?.toString() || 'N/A')
        .replace('{heartRate}', workoutData.avgHeartRate?.toString() || 'N/A')
        .replace('{userText}', castData.text || '');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 150,
        messages: [
          {
            role: 'system',
            content:
              'You are an encouraging running coach. Write short, motivating replies to workout posts.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
      });

      const replyText = response.choices[0]?.message?.content?.trim();

      if (!replyText) {
        throw new Error('No reply generated');
      }

      console.log('✅ Generated reply:', replyText);
      return replyText;
    } catch (error) {
      console.error('❌ Error generating reply:', error);

      // Fallback reply
      const fallbackReply = this.generateFallbackReply(workoutData);
      console.log('📝 Using fallback reply:', fallbackReply);
      return fallbackReply;
    }
  }

  private generateFallbackReply(workoutData: CastWorkoutData): string {
    const distance = workoutData.distance;
    const duration = workoutData.duration;
    const pace = workoutData.pace;

    if (distance && duration && pace) {
      return `🔥 Amazing run! ${distance}km in ${duration}min at ${pace} pace is incredible! Keep pushing those limits! 💪`;
    } else if (distance && duration) {
      return `🏃‍♂️ Great workout! ${distance}km in ${duration}min - you're building amazing endurance! Keep it up! ✨`;
    } else if (distance) {
      return `🎯 Solid distance! ${distance}km is a fantastic achievement. Your consistency is inspiring! 💪`;
    } else {
      return `🏃‍♀️ Great workout! Keep pushing your limits and building that endurance! You're doing amazing! ✨`;
    }
  }

  private async postReplyToFarcaster(
    parentCastHash: string,
    replyText: string,
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
      const reply = await this.neynarClient.publishCast(signerUuid, replyText, {
        replyTo: parentCastHash,
      });

      console.log('✅ Reply posted successfully:', reply?.hash);
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
      this.logger.log(`Processing cast ${castData.castHash} with GPT-4 Vision`);

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
        castHash: castData.castHash,
      });

      const savedRunningSession =
        await this.runningSessionRepository.save(runningSession);

      // Create FarcasterCast
      const farcasterCast = this.farcasterCastRepository.create({
        userId: user.id,
        completedRunId: savedRunningSession.id,
        farcasterCastHash: castData.castHash,
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
