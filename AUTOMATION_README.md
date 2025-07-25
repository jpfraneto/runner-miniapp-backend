# 🏃‍♂️ RunnerCoin Automation System

This document explains the new automated cast fetching and session processing system that has been integrated into the RunnerCoin backend.

## 🚀 What's New

### Automated Cast Fetching
- **Server Startup**: Automatically fetches new casts from the "running" Farcaster channel when the server starts
- **Smart Fetching**: Only fetches new casts since the last run, avoiding duplicates
- **Data Storage**: Stores cast data in `./data/running_casts.json`

### Single Admin Endpoint
- **FID Authorization**: Only FID 16098 can trigger the automation
- **Existing Flow Integration**: Uses the same validation logic as webhook processing
- **Database Consistency**: Data is stored exactly like normal workout validations

## 🔧 Configuration

### Environment Variables
Ensure these are set in your `.env` file:

```bash
# Required for cast fetching
NEYNAR_API_KEY=your-neynar-api-key-here

# Required for session processing
OPENAI_API_KEY=your-openai-api-key-here
```

### Dependencies
The system requires:
- MySQL database (configured via TypeORM)
- Internet access for API calls
- Writable `./data/` directory

## 📡 API Endpoint

### Process Full Automation
```bash
POST /admin/process-automation
Content-Type: application/json

{
  "fid": 16098,
  "numToProcess": 10
}
```

**Authorization**: Only FID 16098 can trigger this endpoint.

**What it does**:
1. Fetches new casts from the "running" Farcaster channel
2. Processes the most recent running sessions using the existing validation flow
3. Data is stored exactly like webhook processing (same database schema, same validation logic)

**Response:**
```json
{
  "success": true,
  "message": "Full automation completed successfully",
  "data": {
    "castFetching": {
      "newCasts": 25,
      "totalCasts": 1247
    },
    "sessionProcessing": {
      "processed": 10,
      "workouts": 7
    }
  }
}
```

**Error Response (Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Only authorized users can trigger automation"
}
```

## 🔄 Workflow

### 1. Server Startup
```
Server starts → CastFetchingService runs → Fetches new casts → Saves to running_casts.json
```

### 2. Manual Automation (FID 16098 only)
```
API call → Check FID authorization → Fetch new casts → Process with existing validation flow → Save to database
```

### 3. Data Storage Flow
```
Cast data → SocialService.processCastWebhook() → CastProcessorService → AI analysis → Database updates
```

## 🗂️ Data Flow

### Cast Data Structure
```typescript
interface CastData {
  castHash: string;
  author: {
    fid: number;
    username: string;
    pfp_url: string;
  };
  text: string;
  timestamp: string;
  embeds: any[];
  reactions: {
    likes_count: number;
    recasts_count: number;
  };
  replies: {
    count: number;
  };
}
```

### Database Updates
The automation uses the exact same database flow as webhook processing:
1. **RunningSession**: Created with PROCESSING status, then updated to COMPLETED/FAILED
2. **User**: Updated with workout stats, tokens, and streaks
3. **UserStats**: Aggregated statistics updated
4. **Daily Limits**: Enforced (one workout per user per day)
5. **AI Replies**: Generated and posted back to Farcaster (if configured)

## 🎯 Benefits

### ✅ Before vs After

**Before:**
- Manual script execution
- Separate folder management
- Manual database resets
- Risk of data loss

**After:**
- Automatic cast fetching on startup
- Integrated database management
- API-driven processing
- Persistent data tracking

## 📊 Monitoring

### Logs
The system provides detailed logging for:
- Cast fetching progress
- Session processing status
- Workout detection results
- API errors and successes

### Data Files
- `./data/running_casts.json` - All fetched casts
- `./data/processed_sessions.json` - Tracking of processed cast hashes

## 🚨 Error Handling

The system handles:
- Network failures during cast fetching
- Image processing errors
- Database connection issues
- Rate limiting from external APIs

Failed sessions are marked as processed to avoid infinite retries.

## 🔐 Security

- API endpoints should be protected in production
- OpenAI API key usage is tracked and logged
- Database operations are transaction-safe
- No sensitive data is logged

## 🛠️ Development

### Local Setup
1. Copy `.env.example` to `.env`
2. Add your API keys
3. Start the server: `npm run start:dev`
4. Cast fetching runs automatically on startup

### Testing
```bash
# Trigger full automation (only FID 16098)
curl -X POST http://localhost:8080/admin/process-automation \
  -H "Content-Type: application/json" \
  -d '{"fid": 16098, "numToProcess": 5}'

# Test unauthorized access (should fail)
curl -X POST http://localhost:8080/admin/process-automation \
  -H "Content-Type: application/json" \
  -d '{"fid": 12345, "numToProcess": 5}'
```

## 📈 Production Deployment

1. Set environment variables in production
2. Ensure `./data/` directory exists and is writable
3. Monitor logs for successful startup cast fetching
4. Use admin endpoints to process sessions as needed

---

This automation system eliminates the need for manual script execution and provides a robust, scalable solution for processing Farcaster running data.