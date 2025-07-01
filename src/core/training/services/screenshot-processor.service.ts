// src/core/training/services/screenshot-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export interface ExtractedWorkoutData {
  distance?: number; // in km
  duration?: number; // in minutes
  pace?: string; // e.g., "5:30/km"
  calories?: number;
  elevationGain?: number; // in meters
  avgHeartRate?: number;
  maxHeartRate?: number;
  steps?: number;
  startTime?: string; // ISO string
  endTime?: string; // ISO string
  route?: {
    name?: string;
    type?: string; // outdoor, treadmill, track
  };
  splits?: Array<{
    distance: number;
    time: string;
    pace: string;
  }>;
  weather?: {
    temperature?: number;
    conditions?: string;
  };
  runningApp?: string; // Nike Run Club, Strava, Garmin, etc.
  confidence: number; // 0-1 confidence score
  extractedText?: string[]; // raw OCR text for debugging
  isWorkoutImage?: boolean; // New field to indicate if this is actually a workout
  errorMessage?: string; // Fun message for non-workout images
}

@Injectable()
export class ScreenshotProcessorService {
  private readonly logger = new Logger(ScreenshotProcessorService.name);
  private readonly openai: OpenAI;

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

  constructor() {
    console.log('🔧 Initializing ScreenshotProcessorService');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI client initialized');
  }

  async processScreenshots(
    imageBuffers: Buffer[],
  ): Promise<ExtractedWorkoutData> {
    try {
      console.log(`📸 Processing ${imageBuffers.length} screenshots`);
      this.logger.log(
        `Processing ${imageBuffers.length} screenshots with GPT-4 Vision`,
      );

      // Convert buffers to base64
      console.log('🔄 Converting image buffers to base64');
      const base64Images = imageBuffers.map((buffer) =>
        buffer.toString('base64'),
      );
      console.log(`✅ Converted ${base64Images.length} images to base64`);

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
      return extractedData;
    } catch (error) {
      console.error('❌ Screenshot processing failed:', error);
      this.logger.error('Failed to process screenshots:', error);
      throw new Error(`Screenshot processing failed: ${error.message}`);
    }
  }

  private async extractWorkoutDataFromImages(
    base64Images: string[],
  ): Promise<ExtractedWorkoutData> {
    console.log('🔍 Starting workout data extraction from images');
    const systemPrompt = `You are an expert at analyzing running app screenshots and extracting workout data with high accuracy.

CRITICAL: First, determine if the provided images are actually screenshots from running/fitness apps or contain workout data.

If the images are NOT workout-related (e.g., random photos, food, selfies, landscapes, memes, etc.), return this exact JSON structure:
{
  "isWorkoutImage": false,
  "confidence": 0,
  "errorMessage": "not_workout_image"
}

If the images ARE from running apps or contain workout data, analyze them and extract all available information.

IMPORTANT: You must return ONLY a valid JSON object with the following structure. Do not include any explanatory text before or after the JSON.

For workout images, return:
{
  "isWorkoutImage": true,
  "distance": number, // in km (convert from miles if needed)
  "duration": number, // total time in minutes (convert from hours:minutes:seconds)
  "pace": "string", // average pace like "5:30/km" or "8:30/mile"
  "calories": number,
  "elevationGain": number, // in meters (convert from feet if needed)
  "avgHeartRate": number,
  "maxHeartRate": number,
  "steps": number,
  "startTime": "ISO string", // if visible
  "endTime": "ISO string", // if visible
  "route": {
    "name": "string", // route name if shown
    "type": "string" // "outdoor", "treadmill", "track", etc.
  },
  "splits": [
    {
      "distance": number, // split distance in km
      "time": "string", // split time like "5:30"
      "pace": "string" // split pace like "5:30/km"
    }
  ],
  "weather": {
    "temperature": number, // in Celsius
    "conditions": "string" // "sunny", "cloudy", "rainy", etc.
  },
  "runningApp": "string", // app name detected from UI
  "confidence": number, // 0-1 confidence in extraction accuracy
  "extractedText": ["string"] // raw text you can see for debugging
}

Workout Image Detection:
Look for these indicators that it's a workout screenshot:
- Running app UI elements (Nike Run Club, Strava, Garmin, Apple Fitness, etc.)
- Workout metrics like distance, time, pace, calories
- Map routes or GPS tracking
- Heart rate data or graphs
- Split times or lap information
- Exercise summaries or achievements
- Fitness app branding or logos

Non-Workout Images (return isWorkoutImage: false):
- Regular photos, selfies, landscapes
- Food pictures, memes, screenshots of other apps
- Text messages, social media posts
- Random documents or screenshots
- Anything without fitness/workout data

Extraction Guidelines for Valid Workout Images:
- Only include fields where you can clearly see the data
- Be precise with numbers - don't guess or estimate
- Convert all measurements to metric (km, meters, Celsius)
- For duration, convert everything to total minutes (e.g., 1:23:45 = 83.75 minutes)
- For pace, use format like "5:30/km" with appropriate unit
- Set confidence based on image clarity and data visibility
- Include all visible split data if available
- Identify the running app from UI elements, logos, or design patterns
- Extract route information if shown (route name, indoor/outdoor)
- Look for weather data if displayed

Common Running Apps to Identify:
- Nike Run Club (orange/black theme, swoosh logo)
- Strava (orange/white theme, Strava logo)
- Garmin Connect (blue/white theme, Garmin branding)
- Apple Fitness (colorful rings, Apple design)
- Adidas Running (three stripes, Adidas branding)
- MapMyRun (Under Armour branding)
- Samsung Health (Samsung branding)

Return the JSON object only.`;

    try {
      console.log('🤖 Making API request to GPT-4 Vision');
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
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
                text: 'Please analyze these images. First determine if they are workout screenshots, then extract data if they are. Return only the JSON object.',
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
      let jsonStart = cleanedContent.indexOf('{');
      let jsonEnd = cleanedContent.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('❌ Invalid JSON structure in response');
        throw new Error('Invalid JSON response from GPT-4 Vision');
      }

      const jsonString = cleanedContent.substring(jsonStart, jsonEnd + 1);

      // Parse the JSON response
      console.log('📝 Parsing JSON response');
      const extractedData: ExtractedWorkoutData = JSON.parse(jsonString);

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

  private validateExtractedData(data: any): ExtractedWorkoutData {
    console.log('🔍 Starting data validation');
    const validated: ExtractedWorkoutData = {
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
      typeof data.elevationGain === 'number' &&
      data.elevationGain >= 0 &&
      data.elevationGain < 10000
    ) {
      validated.elevationGain = Math.round(data.elevationGain);
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

    if (
      typeof data.steps === 'number' &&
      data.steps > 0 &&
      data.steps < 100000
    ) {
      validated.steps = Math.round(data.steps);
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

    if (
      typeof data.runningApp === 'string' &&
      data.runningApp.length > 0 &&
      data.runningApp.length < 50
    ) {
      validated.runningApp = data.runningApp.trim();
    }

    // Validate dates
    console.log('📅 Validating dates');
    if (typeof data.startTime === 'string' && data.startTime.length > 0) {
      try {
        const date = new Date(data.startTime);
        if (!isNaN(date.getTime())) {
          validated.startTime = data.startTime;
        }
      } catch (e) {
        console.warn('⚠️ Invalid start time format');
      }
    }

    if (typeof data.endTime === 'string' && data.endTime.length > 0) {
      try {
        const date = new Date(data.endTime);
        if (!isNaN(date.getTime())) {
          validated.endTime = data.endTime;
        }
      } catch (e) {
        console.warn('⚠️ Invalid end time format');
      }
    }

    // Validate nested objects
    console.log('🔍 Validating nested objects');
    if (data.route && typeof data.route === 'object') {
      validated.route = {};
      if (typeof data.route.name === 'string' && data.route.name.length > 0) {
        validated.route.name = data.route.name.trim();
      }
      if (typeof data.route.type === 'string' && data.route.type.length > 0) {
        validated.route.type = data.route.type.trim();
      }
    }

    if (data.weather && typeof data.weather === 'object') {
      validated.weather = {};
      if (
        typeof data.weather.temperature === 'number' &&
        data.weather.temperature > -50 &&
        data.weather.temperature < 60
      ) {
        validated.weather.temperature = Math.round(data.weather.temperature);
      }
      if (
        typeof data.weather.conditions === 'string' &&
        data.weather.conditions.length > 0
      ) {
        validated.weather.conditions = data.weather.conditions.trim();
      }
    }

    // Validate splits array
    console.log('📊 Validating splits data');
    if (Array.isArray(data.splits) && data.splits.length > 0) {
      validated.splits = data.splits
        .filter(
          (split) =>
            split &&
            typeof split.distance === 'number' &&
            split.distance > 0 &&
            typeof split.time === 'string' &&
            split.time.length > 0 &&
            typeof split.pace === 'string' &&
            split.pace.length > 0,
        )
        .slice(0, 20) // Limit to 20 splits max
        .map((split) => ({
          distance: Math.round(split.distance * 100) / 100,
          time: split.time.trim(),
          pace: split.pace.trim(),
        }));
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
      if (validated.runningApp) dataPoints++;
      if (validated.route) dataPoints++;
      if (validated.splits && validated.splits.length > 0) dataPoints++;
      if (validated.avgHeartRate) dataPoints++;
      if (validated.elevationGain) dataPoints++;
      if (validated.steps) dataPoints++;

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

  /**
   * Health check for the screenshot processor
   */
  async healthCheck(): Promise<{ status: string; model: string }> {
    try {
      console.log('🏥 Running health check');
      // Test with a simple request
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
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
        model: 'gpt-4o',
      };
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.logger.error('Screenshot processor health check failed:', error);
      return {
        status: 'unhealthy',
        model: 'gpt-4o',
      };
    }
  }
}
