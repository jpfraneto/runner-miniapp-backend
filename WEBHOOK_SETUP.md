# Farcaster Webhook Setup Guide

This guide explains how to set up Farcaster webhooks using Neynar to automatically process running workout casts.

## Overview

The webhook system processes Farcaster casts in real-time, extracts workout data from images using AI, and saves the data to our database. This follows the same pattern as the screenshot processor but works with incoming webhooks instead of uploaded files.

## Webhook Endpoints

### 1. General Cast Processing

```
POST /social-service/farcaster/cast-webhook
```

Processes all incoming casts and attempts to extract workout data.

### 2. Embed-Filtered Processing

```
POST /social-service/farcaster/cast-webhook/embed-filter
```

Only processes casts that contain image embeds (more efficient).

### 3. User-Filtered Processing

```
POST /social-service/farcaster/cast-webhook/user-filter
```

Only processes casts from specific FIDs (useful for testing).

### 4. Health Check

```
GET /social-service/farcaster/webhook-health
```

Checks if the webhook processing system is healthy.

## Neynar Webhook Setup

### Step 1: Get Neynar API Key

1. Sign up at [neynar.com](https://neynar.com)
2. Get your API key from the dashboard
3. Note your API key for the next steps

### Step 2: Create Webhook Subscription

Using the Neynar API, create a webhook subscription:

```bash
curl -X POST "https://api.neynar.com/v2/farcaster/webhook" \
  -H "api_key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-domain.com/social-service/farcaster/cast-webhook",
    "webhook_type": "cast.created",
    "filters": {
      "embeds": true
    }
  }'
```

### Step 3: Alternative - Embed-Filtered Webhook

For better performance, use the embed-filtered endpoint:

```bash
curl -X POST "https://api.neynar.com/v2/farcaster/webhook" \
  -H "api_key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-domain.com/social-service/farcaster/cast-webhook/embed-filter",
    "webhook_type": "cast.created",
    "filters": {
      "embeds": true
    }
  }'
```

### Step 4: Test with Specific Users

For testing with known users:

```bash
curl -X POST "https://api.neynar.com/v2/farcaster/webhook" \
  -H "api_key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-domain.com/social-service/farcaster/cast-webhook/user-filter",
    "webhook_type": "cast.created",
    "filters": {
      "embeds": true,
      "fids": [194, 1234, 5678]
    }
  }'
```

## Webhook Payload Format

The webhook receives data in this format:

```json
{
  "cast": {
    "hash": "0x1234567890abcdef...",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "text": "Just finished my morning run! 🏃‍♂️",
    "author": {
      "fid": 194,
      "username": "rish.eth",
      "pfp_url": "https://..."
    },
    "embeds": [
      {
        "url": "https://imagedelivery.net/...",
        "metadata": {
          "content_type": "image/jpeg"
        }
      }
    ],
    "reactions": {
      "likes": [...],
      "recasts": [...]
    },
    "replies": {
      "count": 5
    }
  }
}
```

## Processing Flow

1. **Webhook Received**: Neynar sends cast data to our endpoint
2. **Image Detection**: Check if cast contains image embeds
3. **Image Download**: Convert image URLs to base64
4. **AI Analysis**: Use GPT-4 Vision to extract workout data
5. **Data Validation**: Validate and sanitize extracted data
6. **Database Save**: Save workout data and update user stats
7. **AI Reply Generation**: Create encouraging reply based on workout data
8. **Post Reply**: Reply to the original cast with encouragement
9. **Response**: Return processing result

## Environment Variables

Make sure these are set in your environment:

```bash
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_database_connection_string
NEYNAR_API_KEY=your_neynar_api_key
NEYNAR_SIGNER_UUID=your_neynar_signer_uuid
```

## Testing the Webhook

### 1. Test with Curl

```bash
curl -X POST "https://your-domain.com/social-service/farcaster/cast-webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "cast": {
      "hash": "0xtest123",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "text": "Morning run completed!",
      "author": {
        "fid": 194,
        "username": "test.user",
        "pfp_url": "https://example.com/pfp.jpg"
      },
      "embeds": [
        {
          "url": "https://example.com/workout-screenshot.jpg"
        }
      ],
      "reactions": {
        "likes": [],
        "recasts": []
      },
      "replies": {
        "count": 0
      }
    }
  }'
```

### 2. Check Health Status

```bash
curl "https://your-domain.com/social-service/farcaster/webhook-health"
```

## Monitoring and Logs

The webhook processing includes comprehensive logging:

- `📨 Farcaster cast webhook received` - Webhook received
- `📊 Webhook data:` - Logs the incoming data
- `📸 Processing cast with X embeds` - Processing started
- `🔄 Converting image URLs to base64` - Image processing
- `🤖 Extracting workout data using GPT-4 Vision` - AI analysis
- `✅ Webhook processed successfully` - Success
- `❌ Webhook processing failed` - Error

## Error Handling

The system handles various error scenarios:

- **Invalid webhook format**: Returns 400 with error message
- **No images in cast**: Skips processing
- **Image download failure**: Logs error and continues
- **AI processing failure**: Returns fallback response
- **Database errors**: Logs error and returns failure

## Performance Considerations

1. **Image Filtering**: Use embed-filtered endpoint to reduce unnecessary processing
2. **User Filtering**: Use user-filtered endpoint for testing with specific users
3. **Rate Limiting**: Neynar has rate limits, monitor usage
4. **Image Size**: Large images may timeout, consider image optimization
5. **Database Connections**: Ensure proper connection pooling

## Troubleshooting

### Common Issues

1. **Webhook not receiving data**
   - Check Neynar webhook subscription status
   - Verify webhook URL is accessible
   - Check server logs for errors

2. **Images not processing**
   - Verify image URLs are accessible
   - Check network connectivity
   - Review image format support

3. **AI processing failures**
   - Verify OpenAI API key
   - Check API rate limits
   - Review prompt and response format

4. **Database errors**
   - Check database connection
   - Verify table schemas
   - Review foreign key constraints

### Debug Commands

```bash
# Check webhook health
curl "https://your-domain.com/social-service/farcaster/webhook-health"

# Test with sample data
curl -X POST "https://your-domain.com/social-service/farcaster/cast-webhook" \
  -H "Content-Type: application/json" \
  -d @sample-cast.json

# View server logs
tail -f /var/log/your-app.log
```

## Security Considerations

1. **Webhook Authentication**: Consider adding webhook signature verification
2. **Rate Limiting**: Implement rate limiting on webhook endpoints
3. **Input Validation**: Validate all incoming webhook data
4. **Error Handling**: Don't expose sensitive information in error responses
5. **Monitoring**: Set up alerts for webhook failures

## Next Steps

1. Set up webhook subscriptions with Neynar
2. Test with sample data
3. Monitor processing logs
4. Set up alerts for failures
5. Optimize based on usage patterns
