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
}

@Injectable()
export class ScreenshotProcessorService {
  private readonly logger = new Logger(ScreenshotProcessorService.name);
  private readonly openai: OpenAI;

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
      this.logger.log(
        `Successfully extracted workout data with ${Math.round(extractedData.confidence * 100)}% confidence`,
      );
      return extractedData;
    } catch (error) {
      console.error('❌ Screenshot processing failed:', error);
      this.logger.error(`Failed to process screenshots:`, error);
      throw new Error(`Screenshot processing failed: ${error.message}`);
    }
  }

  private async extractWorkoutDataFromImages(
    base64Images: string[],
  ): Promise<ExtractedWorkoutData> {
    console.log('🔍 Starting workout data extraction from images');
    const systemPrompt = `You are an expert at analyzing running app screenshots and extracting workout data with high accuracy.

Analyze the provided screenshots from running apps (Nike Run Club, Strava, Garmin Connect, Apple Fitness, Adidas Running, MapMyRun, etc.) and extract all available workout information.

IMPORTANT: You must return ONLY a valid JSON object with the following structure. Do not include any explanatory text before or after the JSON.

{
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

Extraction Guidelines:
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

Common Apps to Identify:
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
                text: 'Please analyze these running app screenshots and extract all workout data. Return only the JSON object.',
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
      console.log('IN HERE, the content is', content);
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

      // Validate and sanitize the extracted data
      console.log('✨ Validating extracted data');
      return this.validateExtractedData(extractedData);
    } catch (error) {
      console.error('❌ GPT-4 Vision API error:', error);
      this.logger.error('GPT-4 Vision API error:', error);

      // Return a fallback response with low confidence
      return {
        confidence: 0,
        extractedText: [`Error processing images: ${error.message}`],
      };
    }
  }

  private validateExtractedData(data: any): ExtractedWorkoutData {
    console.log('🔍 Starting data validation');
    const validated: ExtractedWorkoutData = {
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
        model: 'gpt-4-vision-preview',
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
        model: 'gpt-4-vision-preview',
      };
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.logger.error('Screenshot processor health check failed:', error);
      return {
        status: 'unhealthy',
        model: 'gpt-4-vision-preview',
      };
    }
  }
}
