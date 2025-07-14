// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';

// Models
import { User, UserRoleEnum } from '../../../models';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';

// Utils
import NeynarService from '../../../utils/neynar';

/**
 * Interface for leaderboard response with user position info
 */
export interface LeaderboardResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  currentUser?: {
    position: number;
    runnerTokens: number;
    user: Pick<User, 'id' | 'fid' | 'username' | 'pfpUrl'>;
  };
}

@Injectable()
export class UserService {
  /**
   * Cache for leaderboard data
   */
  private leaderboardCache: {
    'all-time': {
      users: User[];
      lastUpdated: Date;
      total: number;
    } | null;
    weekly: {
      users: User[];
      lastUpdated: Date;
      total: number;
    } | null;
  } = {
    'all-time': null,
    weekly: null,
  };

  /**
   * Cache TTL in milliseconds (15 minutes)
   */
  private readonly CACHE_TTL = 15 * 60 * 1000;

  /**
   * OpenAI client for AI-powered features
   */
  private openai: OpenAI;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Retrieves a user by their Farcaster ID with optional selected fields and relations.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to retrieve.
   * @param {(keyof User)[]} [select=[]] - Optional array of fields to select.
   * @param {(keyof User)[]} [relations=[]] - Optional array of relations to include.
   * @returns {Promise<User | undefined>} The user entity or undefined if not found.
   */
  async getByFid(
    fid: User['fid'],
    select: (keyof User)[] = [],
    relations: (keyof User)[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      ...(select.length > 0 && {
        select,
      }),
      where: {
        fid,
      },
      ...(relations.length > 0 && {
        relations,
      }),
    });
  }

  /**
   * Upserts a user based on the provided Farcaster ID. This method checks if a user with the given Farcaster ID exists. If the user exists, it updates the user with the provided data; otherwise, it creates a new user with the given data and assigns a default role of USER.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to upsert.
   * @param {Partial<User>} data - An object containing the fields to update for an existing user or to set for a new user.
   * @returns {Promise<{isCreated: boolean; user: User}>} An object containing a boolean flag indicating if a new user was created and the upserted user entity.
   */
  async upsert(
    fid: User['fid'],
    data: Partial<User>,
  ): Promise<{ isCreated: boolean; user: User }> {
    let isCreated: boolean = false;
    let user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (user) {
      Object.assign(user, data);
    } else {
      isCreated = true;
      user = this.userRepository.create({
        fid,
        ...data,
        role: UserRoleEnum.USER,
      });
    }

    await this.userRepository.save(user);

    return {
      isCreated,
      user,
    };
  }

  /**
   * Updates a user's data based on the provided user ID.
   *
   * @param {User['id']} id - The ID of the user to update.
   * @param {Partial<User>} data - The data to update the user with.
   * @returns {Promise<User>} The updated user entity.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async update(id: User['id'], data: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        id,
      },
    });

    if (!user) {
      throw new Error(`User with ID ${id} not found.`);
    }

    Object.assign(user, data);
    await this.userRepository.save(user);

    return user;
  }

  /**
   * Updates a user's goal by their FID.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to update.
   * @param {string} goal - The goal to set for the user.
   * @param {'preset' | 'custom'} goalType - The type of goal being set.
   * @returns {Promise<User>} The updated user entity.
   * @throws {Error} If the user with the specified FID is not found.
   */
  async updateGoal(fid: User['fid'], goal: string, goalType: 'preset' | 'custom'): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    // Update the goal and mark user as having an active training plan
    Object.assign(user, {
      currentGoal: goal,
      hasActiveTrainingPlan: true,
    });

    await this.userRepository.save(user);

    console.log(`✅ [UserService] Updated goal for user ${user.username} (FID: ${fid}): ${goal}`);
    return user;
  }

  /**
   * Gets a user's current goal by their FID.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user.
   * @returns {Promise<string | null>} The user's current goal or null if not set.
   * @throws {Error} If the user with the specified FID is not found.
   */
  async getUserGoal(fid: User['fid']): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
      select: ['currentGoal'],
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    return user.currentGoal;
  }

  /**
   * Generates a personalized training plan using AI based on user's goal and current fitness level.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user.
   * @param {string} goal - The user's goal (e.g., "5k", "10k", "21k", "42k", or custom text).
   * @param {'preset' | 'custom'} goalType - The type of goal being set.
   * @returns {Promise<any>} The generated training plan from AI.
   * @throws {Error} If the user with the specified FID is not found or AI generation fails.
   */
  async generateTrainingPlan(fid: User['fid'], goal: string, goalType: 'preset' | 'custom'): Promise<any> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
      relations: ['runningSessions'],
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
    }

    // Get user's recent running history for context
    const recentSessions = await this.runningSessionRepository.find({
      where: { user: { fid } },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    // Build user context for AI
    const userContext = {
      currentLevel: user.fitnessLevel,
      totalRuns: user.totalRuns,
      totalDistance: user.totalDistance,
      averageWeeklyRuns: user.preferredWeeklyFrequency,
      recentRunsCount: recentSessions.length,
      averageDistance: recentSessions.length > 0 ? 
        recentSessions.reduce((sum, session) => sum + (session.distance || 0), 0) / recentSessions.length : 0,
    };

    const prompt = this.buildTrainingPlanPrompt(goal, goalType, userContext);

    try {
      console.log(`🤖 [UserService] Generating training plan for user ${user.username} (FID: ${fid})`);
      console.log(`🎯 Goal: ${goal} (${goalType})`);
      console.log(`📊 User context:`, userContext);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert running coach and training plan specialist. You create personalized, safe, and effective training plans for runners of all levels.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const aiResponse = completion.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('Failed to generate training plan - no response from AI');
      }

      // Try to parse JSON response
      let trainingPlan;
      try {
        trainingPlan = JSON.parse(aiResponse);
      } catch (parseError) {
        console.error('❌ [UserService] Failed to parse AI response as JSON:', parseError);
        // If JSON parsing fails, return a structured version of the text response
        trainingPlan = {
          goal,
          goalType,
          generatedAt: new Date().toISOString(),
          plan: aiResponse,
          userLevel: user.fitnessLevel,
          estimatedWeeks: this.estimateTrainingWeeks(goal, goalType),
        };
      }

      console.log(`✅ [UserService] Generated training plan for user ${user.username}`);
      return trainingPlan;
    } catch (error) {
      console.error('❌ [UserService] Error generating training plan:', error);
      throw new Error(`Failed to generate training plan: ${error.message}`);
    }
  }

  /**
   * Builds a comprehensive prompt for AI training plan generation.
   *
   * @param {string} goal - The user's goal.
   * @param {'preset' | 'custom'} goalType - The type of goal.
   * @param {any} userContext - User's current fitness context.
   * @returns {string} The formatted prompt for AI.
   */
  private buildTrainingPlanPrompt(goal: string, goalType: 'preset' | 'custom', userContext: any): string {
    const basePrompt = `
Please create a personalized training plan for a runner with the following details:

GOAL: ${goal} (${goalType === 'preset' ? 'Standard distance' : 'Custom goal'})

CURRENT FITNESS LEVEL:
- Experience Level: ${userContext.currentLevel}
- Total Runs Completed: ${userContext.totalRuns}
- Total Distance Covered: ${userContext.totalDistance} km
- Preferred Weekly Frequency: ${userContext.averageWeeklyRuns} runs per week
- Recent Activity: ${userContext.recentRunsCount} runs in recent history
- Average Distance per Run: ${userContext.averageDistance.toFixed(2)} km

REQUIREMENTS:
1. Create a progressive training plan that safely builds toward the goal
2. Include appropriate warmup, main workout, and cooldown phases
3. Consider injury prevention and recovery
4. Provide weekly structure with specific workouts
5. Include different types of runs (easy, tempo, intervals, long runs)
6. Adapt to the user's current fitness level and experience

RESPONSE FORMAT:
Please respond with a JSON object containing:
{
  "goal": "${goal}",
  "goalType": "${goalType}",
  "estimatedWeeks": number,
  "trainingPhases": [
    {
      "phase": "Base Building/Speed Work/Peak/Taper",
      "weeks": number,
      "description": "Phase description",
      "weeklyStructure": {
        "totalRuns": number,
        "totalDistance": number,
        "keyWorkouts": ["description of key workouts"]
      }
    }
  ],
  "weeklySchedule": {
    "monday": "Rest or Cross-training",
    "tuesday": "Workout type and description",
    "wednesday": "Workout type and description",
    "thursday": "Workout type and description",
    "friday": "Rest or Easy run",
    "saturday": "Long run or Key workout",
    "sunday": "Recovery run or Rest"
  },
  "keyPrinciples": [
    "Important training principles for this goal"
  ],
  "progressionTips": [
    "How to progress safely"
  ],
  "injuryPrevention": [
    "Key injury prevention strategies"
  ],
  "nutritionTips": [
    "Basic nutrition guidelines for this goal"
  ]
}

Make sure the plan is:
- Appropriate for a ${userContext.currentLevel} runner
- Progressive and safe
- Specific to achieving the goal: ${goal}
- Realistic given their current fitness level
- Includes variety to prevent boredom
- Emphasizes consistency over intensity for beginners
`;

    return basePrompt;
  }

  /**
   * Estimates training duration based on goal type.
   *
   * @param {string} goal - The user's goal.
   * @param {'preset' | 'custom'} goalType - The type of goal.
   * @returns {number} Estimated weeks for training.
   */
  private estimateTrainingWeeks(goal: string, goalType: 'preset' | 'custom'): number {
    if (goalType === 'preset') {
      switch (goal) {
        case '5k':
          return 8;
        case '10k':
          return 12;
        case '21k':
          return 16;
        case '42k':
          return 20;
        default:
          return 12;
      }
    }
    // For custom goals, provide a default estimate
    return 12;
  }

  /**
   * Deletes a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to delete.
   * @returns {Promise<boolean>} Returns true if the user was successfully deleted.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async delete(id: User['id']): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: {
        id,
      },
    });

    if (!user) {
      throw new Error(`User with ID ${id} not found.`);
    }

    await this.userRepository.remove(user);

    return true;
  }

  /**
   * Gets the user's workout history with pagination
   *
   * @param {number} fid - The Farcaster ID of the user
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Number of runs per page (default: 30)
   * @returns {Promise<{
   *   workouts: RunningSession[];
   *   pagination: {
   *     page: number;
   *     limit: number;
   *     total: number;
   *     totalPages: number;
   *     hasNext: boolean;
   *     hasPrev: boolean;
   *   };
   * }>} The user's workout history with pagination
   */
  async getWorkoutHistory(
    fid: number,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    workouts: RunningSession[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await this.runningSessionRepository.count({
      where: { fid },
    });

    // Get workouts with pagination, ordered by creation date (newest first)
    const workouts = await this.runningSessionRepository.find({
      where: { fid },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
      relations: ['intervals', 'user'], // Include intervals and user data
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      workouts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  /**
   * Gets the user's fitness stats
   *
   * @param {number} fid - The Farcaster ID of the user
   * @returns {Promise<any>} The user's fitness stats
   */
  async getFitnessStats(fid: number): Promise<any> {
    // TODO: Implement fitness stats retrieval
    return {};
  }

  /**
   * Gets the fitness leaderboard with pagination and current user position
   *
   * @param {number} page - The page number for pagination
   * @param {number} limit - The number of records per page
   * @param {number} currentUserFid - The Farcaster ID of the current user
   * @param {string} timePeriod - The time period filter ('weekly' or 'all-time')
   * @returns {Promise<LeaderboardResponse>} The leaderboard data
   */
  async getFitnessLeaderboard(
    page: number,
    limit: number,
    currentUserFid: number,
    timePeriod: 'weekly' | 'all-time' = 'all-time',
  ): Promise<LeaderboardResponse> {
    await this.refreshLeaderboardCacheIfNeeded(timePeriod);

    const cache = this.leaderboardCache[timePeriod];
    if (!cache) {
      throw new Error(`Leaderboard cache for ${timePeriod} is not available`);
    }

    const skip = (page - 1) * limit;
    const users = cache.users.slice(skip, skip + limit);
    const total = cache.total;
    const totalPages = Math.ceil(total / limit);

    let currentUser: LeaderboardResponse['currentUser'] | undefined;

    if (currentUserFid) {
      const currentUserIndex = cache.users.findIndex(
        (user) => user.fid === currentUserFid,
      );

      if (currentUserIndex !== -1) {
        const user = cache.users[currentUserIndex];
        currentUser = {
          position: currentUserIndex + 1,
          runnerTokens: user.runnerTokens,
          user: {
            id: user.id,
            fid: user.fid,
            username: user.username,
            pfpUrl: user.pfpUrl,
          },
        };
      }
    }

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      currentUser,
    };
  }

  /**
   * Refreshes the leaderboard cache if it's expired or doesn't exist.
   *
   * @private
   */
  private async refreshLeaderboardCacheIfNeeded(
    timePeriod: 'weekly' | 'all-time',
  ): Promise<void> {
    const now = new Date();
    const cache = this.leaderboardCache[timePeriod];
    const shouldRefresh =
      !cache || now.getTime() - cache.lastUpdated.getTime() > this.CACHE_TTL;

    if (shouldRefresh) {
      await this.refreshLeaderboardCache(timePeriod);
    }
  }

  /**
   * Get the current week's date range (Monday to Sunday)
   *
   * @private
   */
  private getCurrentWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // Calculate days to subtract to get to Monday (start of week)
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { start: startOfWeek, end: endOfWeek };
  }

  /**
   * Refreshes the leaderboard cache by querying all users sorted by points.
   *
   * @private
   */
  private async refreshLeaderboardCache(
    timePeriod: 'weekly' | 'all-time',
  ): Promise<void> {
    try {
      let users: User[];

      if (timePeriod === 'weekly') {
        // For weekly leaderboard, we need to calculate weekly stats
        users = await this.getWeeklyLeaderboard();
      } else {
        // For all-time leaderboard, use existing logic
        users = await this.userRepository.find({
          select: [
            'id',
            'fid',
            'username',
            'pfpUrl',
            'runnerTokens',
            'createdAt',
          ],
          order: {
            runnerTokens: 'DESC',
            createdAt: 'ASC', // Ties broken by earliest registration
          },
        });
      }

      this.leaderboardCache[timePeriod] = {
        users,
        total: users.length,
        lastUpdated: new Date(),
      };

      console.log(
        `✅ [UserService] ${timePeriod} leaderboard cache refreshed with ${users.length} users`,
      );
    } catch (error) {
      console.error(
        `❌ [UserService] Failed to refresh ${timePeriod} leaderboard cache:`,
        error,
      );
      // Keep old cache if refresh fails
    }
  }

  /**
   * Get weekly leaderboard data based on current week's running sessions
   *
   * @private
   */
  private async getWeeklyLeaderboard(): Promise<User[]> {
    const { start, end } = this.getCurrentWeekRange();

    console.log(
      `📅 [UserService] Calculating weekly leaderboard for ${start.toISOString()} to ${end.toISOString()}`,
    );

    // Get all running sessions for the current week
    const weeklySessionsQuery = `
      SELECT 
        u.id,
        u.fid,
        u.username,
        u.pfpUrl,
        u.createdAt,
        COALESCE(SUM(rs.distance), 0) as weeklyDistance,
        COALESCE(COUNT(rs.id), 0) as weeklyRuns,
        COALESCE(SUM(rs.duration), 0) as weeklyDuration
      FROM users u
      LEFT JOIN running_sessions rs ON u.id = rs.userId 
        AND rs.completedDate >= ? 
        AND rs.completedDate <= ?
        AND rs.isWorkoutImage = true
        AND rs.confidence > 0.3
      GROUP BY u.id, u.fid, u.username, u.pfpUrl, u.createdAt
      ORDER BY weeklyDistance DESC, weeklyRuns DESC, u.createdAt ASC
    `;

    const result = await this.userRepository.query(weeklySessionsQuery, [
      start.toISOString(),
      end.toISOString(),
    ]);

    // Map the raw query results to User objects with additional weekly stats
    return result.map((row: any) => ({
      id: row.id,
      fid: row.fid,
      username: row.username,
      pfpUrl: row.pfpUrl,
      createdAt: row.createdAt,
      runnerTokens: parseFloat(row.weeklyDistance) || 0, // Use weekly distance as the sorting metric
      // Store additional weekly stats for potential future use
      weeklyStats: {
        distance: parseFloat(row.weeklyDistance) || 0,
        runs: parseInt(row.weeklyRuns) || 0,
        duration: parseFloat(row.weeklyDuration) || 0,
      },
    }));
  }

  /**
   * Invalidates the leaderboard cache, forcing a refresh on next request.
   */
  public invalidateLeaderboardCache(timePeriod?: 'weekly' | 'all-time'): void {
    if (timePeriod) {
      this.leaderboardCache[timePeriod] = null;
      console.log(
        `🔄 [UserService] ${timePeriod} leaderboard cache invalidated`,
      );
    } else {
      this.leaderboardCache['all-time'] = null;
      this.leaderboardCache['weekly'] = null;
      console.log('🔄 [UserService] All leaderboard caches invalidated');
    }
  }

  /**
   * Gets a user's profile including stats and recent workouts
   *
   * @param {number} fid - The Farcaster ID of the user
   * @returns {Promise<{
   *   user: {
   *     fid: number;
   *     username: string;
   *     pfpUrl: string;
   *     displayName?: string;
   *   };
   *   stats: {
   *     totalDistance: number;
   *     totalDuration: number;
   *     averagePace: string;
   *     totalWorkouts: number;
   *     personalBests: number;
   *     favoriteDistance: string | null;
   *     totalCalories: number;
   *   };
   *   recentWorkouts: {
   *     workouts: RunningSession[];
   *     pagination: {
   *       page: number;
   *       limit: number;
   *       total: number;
   *       totalPages: number;
   *       hasNext: boolean;
   *       hasPrev: boolean;
   *     };
   *   };
   * } | null>} The user's profile data or null if not found
   */
  async getUserProfile(fid: number): Promise<{
    user: {
      fid: number;
      username: string;
      pfpUrl: string;
      displayName?: string;
    };
    stats: {
      totalDistance: number;
      totalDuration: number;
      averagePace: string;
      totalWorkouts: number;
      personalBests: number;
      favoriteDistance: string | null;
      totalCalories: number;
    };
    recentWorkouts: {
      workouts: RunningSession[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    };
  } | null> {
    // Get the target user
    const user = await this.userRepository.findOne({
      where: { fid },
      select: ['id', 'fid', 'username', 'pfpUrl'],
    });

    if (!user) {
      return null;
    }

    // Get user's running sessions for stats calculation
    const allSessions = await this.runningSessionRepository.find({
      where: { fid },
      order: { createdAt: 'DESC' },
      relations: ['intervals', 'user'],
    });

    // Calculate statistics from all sessions
    const stats = this.calculateUserStats(allSessions);

    // Get recent workouts with pagination (max 16)
    const recentWorkouts = await this.getWorkoutHistory(user.fid, 1, 16);

    return {
      user: {
        fid: user.fid,
        username: user.username,
        pfpUrl: user.pfpUrl,
        displayName: user.username, // Using username as displayName since displayName field doesn't exist
      },
      stats,
      recentWorkouts,
    };
  }

  /**
   * Calculates user statistics from their workout sessions
   *
   * @param {RunningSession[]} sessions - Array of user's running sessions
   * @returns {any} Calculated statistics
   */
  private calculateUserStats(sessions: RunningSession[]): any {
    if (sessions.length === 0) {
      return {
        totalDistance: 0,
        totalDuration: 0,
        averagePace: '0:00/km',
        totalWorkouts: 0,
        personalBests: 0,
        favoriteDistance: null,
        totalCalories: 0,
      };
    }

    // Calculate totals
    const totalDistance = sessions.reduce(
      (sum, session) => sum + Number(session.distance),
      0,
    );
    const totalDuration = sessions.reduce(
      (sum, session) => sum + session.duration,
      0,
    );
    const totalCalories = sessions.reduce(
      (sum, session) => sum + (session.calories || 0),
      0,
    );
    const personalBests = sessions.filter(
      (session) => session.isPersonalBest,
    ).length;

    // Calculate average pace
    const averagePace = this.calculateAveragePace(totalDistance, totalDuration);

    // Find favorite distance (most common distance range)
    const favoriteDistance = this.findFavoriteDistance(sessions);

    return {
      totalDistance: Math.round(totalDistance * 100) / 100, // Round to 2 decimal places
      totalDuration,
      averagePace,
      totalWorkouts: sessions.length,
      personalBests,
      favoriteDistance,
      totalCalories,
    };
  }

  /**
   * Calculates average pace from total distance and duration
   *
   * @param {number} totalDistance - Total distance in km
   * @param {number} totalDuration - Total duration in minutes
   * @returns {string} Average pace in "mm:ss/km" format
   */
  private calculateAveragePace(
    totalDistance: number,
    totalDuration: number,
  ): string {
    if (totalDistance === 0) return '0:00/km';

    const paceMinutesPerKm = totalDuration / totalDistance;
    const minutes = Math.floor(paceMinutesPerKm);
    const seconds = Math.round((paceMinutesPerKm - minutes) * 60);

    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
  }

  /**
   * Finds the most common distance category from user's workouts
   *
   * @param {RunningSession[]} sessions - Array of user's running sessions
   * @returns {string | null} Most common distance category
   */
  private findFavoriteDistance(sessions: RunningSession[]): string | null {
    const distanceCategories: { [key: string]: number } = {};

    sessions.forEach((session) => {
      const distance = Number(session.distance);
      let category: string;

      if (distance <= 3) category = '3K';
      else if (distance <= 5) category = '5K';
      else if (distance <= 10) category = '10K';
      else if (distance <= 21.1) category = 'Half Marathon';
      else if (distance <= 42.2) category = 'Marathon';
      else category = 'Ultra';

      distanceCategories[category] = (distanceCategories[category] || 0) + 1;
    });

    if (Object.keys(distanceCategories).length === 0) return null;

    return Object.keys(distanceCategories).reduce((a, b) =>
      distanceCategories[a] > distanceCategories[b] ? a : b,
    );
  }

  /**
   * Gets runner profile data in the format expected by the frontend
   *
   * @param {number} fid - The Farcaster ID of the user
   * @returns {Promise<{
   *   totalDistance: number;
   *   totalRuns: number;
   *   totalTimeMinutes: number;
   *   currentStreak: number;
   *   longestStreak: number;
   *   averagePace: string;
   *   weeklyStats: Array<{ week: string; distance: number }>;
   *   recentRuns: RunningSession[];
   * }>} User's runner profile data
   */
  async getRunnerProfile(fid: number): Promise<{
    totalDistance: number;
    totalRuns: number;
    totalTimeMinutes: number;
    currentStreak: number;
    longestStreak: number;
    averagePace: string;
    weeklyStats: Array<{ week: string; distance: number }>;
    recentRuns: RunningSession[];
  }> {
    // Get user to access stored stats
    const user = await this.userRepository.findOne({
      where: { fid },
      select: [
        'totalDistance',
        'totalRuns',
        'currentStreak',
        'totalTimeMinutes',
      ],
    });

    // Get all user's running sessions for calculations
    const allSessions = await this.runningSessionRepository
      .createQueryBuilder('rs')
      .leftJoinAndSelect('rs.user', 'user')
      .where('rs.fid = :fid', { fid })
      .andWhere('rs.isWorkoutImage = true')
      .andWhere('rs.confidence > 0.3')
      .orderBy('rs.completedDate', 'DESC')
      .getMany();

    // Calculate total time in minutes from sessions (more accurate than stored value)
    const totalTimeMinutes = allSessions.reduce(
      (sum, session) => sum + session.duration,
      0,
    );

    // Calculate average pace
    const totalDistance = allSessions.reduce(
      (sum, session) => sum + Number(session.distance),
      0,
    );
    const averagePace = this.calculateAveragePace(
      totalDistance,
      totalTimeMinutes,
    );

    // Calculate longest streak (simplified - would need more complex logic for accurate calculation)
    const longestStreak = await this.calculateLongestStreak(fid);

    // Get weekly stats for last 10 weeks
    const weeklyStats = await this.getWeeklyStatsForProfile(fid);

    // Get recent runs (last 15 runs)
    const recentRuns = allSessions.slice(0, 15);

    return {
      totalDistance: user?.totalDistance || totalDistance,
      totalRuns: user?.totalRuns || allSessions.length,
      totalTimeMinutes,
      currentStreak: user?.currentStreak || 0,
      longestStreak,
      averagePace,
      weeklyStats,
      recentRuns,
    };
  }

  /**
   * Gets weekly stats for the last 10 weeks in the format expected by frontend
   *
   * @param {number} fid - The Farcaster ID of the user
   * @returns {Promise<Array<{ week: string; distance: number }>>} Weekly stats
   */
  private async getWeeklyStatsForProfile(
    fid: number,
  ): Promise<Array<{ week: string; distance: number }>> {
    const currentDate = new Date();
    const weeklyStats: Array<{ week: string; distance: number }> = [];

    // Generate data for last 10 weeks
    for (let i = 0; i < 10; i++) {
      const weekStart = new Date(currentDate);
      const dayOfWeek = weekStart.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      // Go back to the start of the week (Monday) and then go back i more weeks
      weekStart.setDate(weekStart.getDate() - daysToMonday - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Query for this week's distance
      const weeklySessionsQuery = `
        SELECT COALESCE(SUM(rs.distance), 0) as totalDistance
        FROM running_sessions rs
        WHERE rs.fid = ? 
          AND rs.completedDate >= ? 
          AND rs.completedDate <= ?
          AND rs.isWorkoutImage = true
          AND rs.confidence > 0.3
      `;

      const result = await this.runningSessionRepository.query(
        weeklySessionsQuery,
        [fid, weekStart.toISOString(), weekEnd.toISOString()],
      );

      const distance = parseFloat(result[0]?.totalDistance) || 0;

      // Format week identifier (W1 = current week, W2 = last week, etc.)
      const weekIdentifier = i === 0 ? 'W1' : `W${i + 1}`;

      weeklyStats.push({
        week: weekIdentifier,
        distance,
      });
    }

    return weeklyStats;
  }

  /**
   * Calculates the longest streak for a user (simplified implementation)
   *
   * @param {number} fid - The Farcaster ID of the user
   * @returns {Promise<number>} Longest streak in days
   */
  private async calculateLongestStreak(fid: number): Promise<number> {
    // Get all sessions ordered by date
    const sessions = await this.runningSessionRepository
      .createQueryBuilder('rs')
      .where('rs.fid = :fid', { fid })
      .andWhere('rs.isWorkoutImage = true')
      .andWhere('rs.confidence > 0.3')
      .orderBy('rs.completedDate', 'ASC')
      .select(['rs.completedDate'])
      .getMany();

    if (sessions.length === 0) return 0;

    let longestStreak = 1;
    let currentStreak = 1;
    let lastDate = new Date(sessions[0].completedDate);

    for (let i = 1; i < sessions.length; i++) {
      const currentDate = new Date(sessions[i].completedDate);
      const daysDifference = Math.floor(
        (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDifference === 1) {
        // Consecutive day
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (daysDifference === 0) {
        // Same day, don't change streak
        continue;
      } else {
        // Gap in days, reset streak
        currentStreak = 1;
      }

      lastDate = currentDate;
    }

    return longestStreak;
  }

  /**
   * Gets user's weekly kilometers for the last N weeks with pagination
   *
   * @param {number} fid - The Farcaster ID of the user
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Number of weeks per page (default: 12)
   * @returns {Promise<{
   *   weeklyKilometers: Array<{
   *     weekStartDate: string;
   *     weekEndDate: string;
   *     totalDistance: number;
   *     totalRuns: number;
   *     totalDuration: number;
   *   }>;
   *   pagination: {
   *     page: number;
   *     limit: number;
   *     total: number;
   *     totalPages: number;
   *     hasNext: boolean;
   *     hasPrev: boolean;
   *   };
   * }>} User's weekly kilometers data with pagination
   */
  async getWeeklyKilometers(
    fid: number,
    page: number = 1,
    limit: number = 12,
  ): Promise<{
    weeklyKilometers: Array<{
      weekStartDate: string;
      weekEndDate: string;
      totalDistance: number;
      totalRuns: number;
      totalDuration: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get the current date and calculate how many weeks back to go
    const currentDate = new Date();
    const totalWeeksToFetch = offset + limit;

    // Generate array of week ranges starting from current week and going backwards
    const weekRanges: Array<{ start: Date; end: Date }> = [];
    for (let i = 0; i < totalWeeksToFetch; i++) {
      const weekStart = new Date(currentDate);
      const dayOfWeek = weekStart.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      // Go back to the start of the week (Monday) and then go back i more weeks
      weekStart.setDate(weekStart.getDate() - daysToMonday - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      weekRanges.push({ start: weekStart, end: weekEnd });
    }

    // Get paginated week ranges
    const paginatedWeeks = weekRanges.slice(offset, offset + limit);

    // Calculate weekly data for each week
    const weeklyKilometers = await Promise.all(
      paginatedWeeks.map(async ({ start, end }) => {
        const weeklySessionsQuery = `
          SELECT 
            COALESCE(SUM(rs.distance), 0) as totalDistance,
            COALESCE(COUNT(rs.id), 0) as totalRuns,
            COALESCE(SUM(rs.duration), 0) as totalDuration
          FROM running_sessions rs
          WHERE rs.fid = ? 
            AND rs.completedDate >= ? 
            AND rs.completedDate <= ?
            AND rs.isWorkoutImage = true
            AND rs.confidence > 0.3
        `;

        const result = await this.runningSessionRepository.query(
          weeklySessionsQuery,
          [fid, start.toISOString(), end.toISOString()],
        );

        const row = result[0] || {};

        return {
          weekStartDate: start.toISOString().split('T')[0],
          weekEndDate: end.toISOString().split('T')[0],
          totalDistance: parseFloat(row.totalDistance) || 0,
          totalRuns: parseInt(row.totalRuns) || 0,
          totalDuration: parseFloat(row.totalDuration) || 0,
        };
      }),
    );

    // For pagination, we'll use a reasonable maximum number of weeks (e.g., 52 weeks = 1 year)
    // In a real application, you might want to calculate this based on user's registration date
    const maxWeeks = 52;
    const totalPages = Math.ceil(maxWeeks / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      weeklyKilometers,
      pagination: {
        page,
        limit,
        total: maxWeeks,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  /**
   * Creates a user from Neynar data when they don't exist in the database
   *
   * @param {number} fid - The Farcaster ID of the user to create
   * @returns {Promise<User>} The created user
   */
  async createUserFromNeynar(fid: number): Promise<User> {
    try {
      console.log(`🔍 [UserService] Creating user from Neynar for FID: ${fid}`);

      const neynar = new NeynarService();
      const { user: neynarUser, isChannelMember } =
        await neynar.getUserWithChannelMembership(fid);

      console.log(
        `📊 [UserService] Neynar user data - Username: ${neynarUser.username}, Channel member: ${isChannelMember}`,
      );

      const { user: newUser } = await this.upsert(fid, {
        username: neynarUser.username,
        pfpUrl: neynarUser.pfp_url,
        runnerTokens: 0,
        totalRuns: 0,
        totalDistance: 0,
        currentStreak: 0,
        // Store channel membership status (could be useful for future features)
        // Note: Add this field to User model if you want to track it
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(
        `✅ [UserService] Successfully created user ${newUser.username} (FID: ${fid})`,
      );

      return newUser;
    } catch (error) {
      console.error(
        `❌ [UserService] Error creating user from Neynar for FID ${fid}:`,
        error,
      );
      throw new Error(`Failed to create user from Neynar: ${error.message}`);
    }
  }

  /**
   * Gets a user by FID, creating from Neynar if they don't exist
   *
   * @param {number} fid - The Farcaster ID of the user
   * @param {(keyof User)[]} [select=[]] - Optional array of fields to select
   * @param {(keyof User)[]} [relations=[]] - Optional array of relations to include
   * @returns {Promise<User>} The user entity
   */
  async getOrCreateUserByFid(
    fid: number,
    select: (keyof User)[] = [],
    relations: (keyof User)[] = [],
  ): Promise<User> {
    let user = await this.getByFid(fid, select, relations);

    if (!user) {
      console.log(
        `👤 [UserService] User not found, creating from Neynar for FID: ${fid}`,
      );
      user = await this.createUserFromNeynar(fid);

      // If specific fields were requested, fetch the user again with those fields
      if (select.length > 0 || relations.length > 0) {
        user = await this.getByFid(fid, select, relations);
      }
    }

    return user;
  }

  /**
   * Gets all users' workout history (public endpoint)
   *
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Number of runs per page (default: 50)
   * @returns {Promise<{
   *   workouts: RunningSession[];
   *   pagination: {
   *     page: number;
   *     limit: number;
   *     total: number;
   *     totalPages: number;
   *     hasNext: boolean;
   *     hasPrev: boolean;
   *   };
   * }>} All users' workout history with pagination
   */
  async getAllUsersWorkouts(
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    workouts: RunningSession[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await this.runningSessionRepository.count();

    // Get workouts with pagination, ordered by creation date (newest first)
    const workouts = await this.runningSessionRepository.find({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
      relations: ['intervals', 'user'], // Include intervals and user data
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      workouts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }
}
