// src/core/training/services/digital-ocean-spaces.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
}

@Injectable()
export class DigitalOceanSpacesService {
  private readonly logger = new Logger(DigitalOceanSpacesService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;

  constructor() {
    this.endpoint = process.env.DO_SPACES_ENDPOINT;
    this.region = process.env.DO_SPACES_REGION || 'nyc3';
    this.bucket = process.env.DO_SPACES_BUCKET || '';

    // Debug logging
    console.log('🔧 DigitalOcean Spaces Config:');
    console.log('  Endpoint:', this.endpoint);
    console.log('  Region:', this.region);
    console.log('  Bucket:', this.bucket);
    console.log(
      '  Access Key ID:',
      process.env.DO_SPACES_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing',
    );
    console.log(
      '  Secret Key:',
      process.env.DO_SPACES_SECRET_KEY ? '✅ Set' : '❌ Missing',
    );

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      credentials: {
        accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.DO_SPACES_SECRET_KEY || '',
      },
      forcePathStyle: false, // Use virtual-hosted-style URLs
    });

    this.logger.log(
      `DigitalOcean Spaces service initialized for bucket: ${this.bucket}`,
    );
  }

  /**
   * Upload a buffer to DigitalOcean Spaces
   */
  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string = 'image/jpeg',
  ): Promise<UploadResult> {
    try {
      this.logger.log(`Uploading file to DigitalOcean Spaces: ${key}`);
      console.log('🔧 DigitalOcean Spaces Config:');
      console.log('  Endpoint:', this.endpoint);
      console.log('  Region:', this.region);
      console.log('  Bucket:', this.bucket);
      console.log('  Access Key ID:', process.env.DO_SPACES_ACCESS_KEY_ID);
      console.log('  Secret Key:', process.env.DO_SPACES_SECRET_KEY);
      console.log('  Buffer:', buffer);
      console.log('  Key:', key);
      console.log('  Content Type:', contentType);

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'max-age=31536000',
      });

      await this.s3Client.send(command);

      // Fix URL construction - use bucket subdomain format
      const url = `https://${this.bucket}.nyc3.digitaloceanspaces.com/${key}`;

      this.logger.log(`Successfully uploaded file: ${url}`);

      return {
        url,
        key,
        bucket: this.bucket,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file to DigitalOcean Spaces: ${key}`);
      this.logger.error(`Error: ${error.message}`);
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Upload multiple buffers (screenshots) for a workout session
   */
  async uploadScreenshots(
    buffers: Buffer[],
    userId: number,
    sessionId: string,
  ): Promise<string[]> {
    try {
      this.logger.log(
        `Uploading ${buffers.length} screenshots for user ${userId}, session ${sessionId}`,
      );

      const uploadPromises = buffers.map((buffer, index) => {
        const key = `screenshots/${userId}/${sessionId}/screenshot-${index + 1}.jpg`;
        return this.uploadBuffer(buffer, key, 'image/jpeg');
      });

      const results = await Promise.all(uploadPromises);
      const urls = results.map((result) => result.url);

      this.logger.log(`Successfully uploaded ${urls.length} screenshots`);
      return urls;
    } catch (error) {
      this.logger.error(
        `Failed to upload screenshots for user ${userId}, session ${sessionId}`,
        error,
      );
      throw new Error(`Screenshot upload failed: ${error.message}`);
    }
  }

  /**
   * Delete a file from DigitalOcean Spaces
   */
  async deleteFile(key: string): Promise<void> {
    try {
      this.logger.log(`Deleting file from DigitalOcean Spaces: ${key}`);

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);

      this.logger.log(`Successfully deleted file: ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete file from DigitalOcean Spaces: ${key}`,
        error,
      );
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for direct uploads
   */
  async generatePresignedUrl(
    key: string,
    contentType: string = 'image/jpeg',
    expiresIn: number = 3600, // 1 hour
  ): Promise<string> {
    try {
      this.logger.log(`Generating presigned URL for: ${key}`);

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(`Generated presigned URL for: ${key}`);
      return presignedUrl;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for: ${key}`, error);
      throw new Error(`Presigned URL generation failed: ${error.message}`);
    }
  }

  /**
   * Health check for DigitalOcean Spaces
   */
  async healthCheck(): Promise<{
    status: string;
    bucket: string;
    endpoint: string;
  }> {
    try {
      // Try to list objects to test connectivity
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: 'health-check',
        Body: 'test',
        ContentType: 'text/plain',
      });

      await this.s3Client.send(command);

      return {
        status: 'healthy',
        bucket: this.bucket,
        endpoint: this.endpoint,
      };
    } catch (error) {
      this.logger.error('DigitalOcean Spaces health check failed:', error);
      return {
        status: 'unhealthy',
        bucket: this.bucket,
        endpoint: this.endpoint,
      };
    }
  }
}
