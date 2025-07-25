// src/core/training/services/screenshot-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PROMPT_THREE } from './prompts';

export interface ExtractedWorkoutData {
  // Core fields that match RunningSession model
  distance?: number; // in km
  duration?: number; // in minutes

  isWorkoutImage?: boolean; // indicates if this is actually a workout
  errorMessage?: string; // fun message for non-workout images
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
    const systemPrompt = PROMPT_THREE;

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
                text: 'Analyze this cast and its embeds. Extract comprehensive workout data with perfect JSON formatting. Return only valid JSON.',
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
      const extractedData: ExtractedWorkoutData = JSON.parse(jsonString);

      // Check if this is not a workout image
      if (extractedData.isWorkoutImage === false) {
        console.log('📷 Non-workout image detected');
        return {
          isWorkoutImage: false,
        };
      }

      // Validate and sanitize the extracted data for workout images
      console.log('✨ Validating extracted workout data');
      return this.validateExtractedData(extractedData);
    } catch (error) {
      console.error('❌ GPT-4 Vision API error:', error);
      this.logger.error('GPT-4 Vision API error:', error);
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

    // Validate confidence
    console.log('🎯 Calculating confidence score');

    // Calculate confidence based on how much data we extracted
    let dataPoints = 0;
    const maxPoints = 10;

    if (validated.distance) dataPoints++;
    if (validated.duration) dataPoints++;

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
        model: 'gpt-4o',
      };
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.logger.error('Screenshot processor health check failed:', error);
      return {
        status: 'unhealthy',
        model: 'gpt-4o-mini',
      };
    }
  }
}
