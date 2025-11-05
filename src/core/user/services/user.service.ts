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
    user: Pick<User, 'fid' | 'username' | 'pfpUrl'>;
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
  async update(fid: User['fid'], data: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
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
  async updateGoal(
    fid: User['fid'],
    goal: string,
    goalType: 'preset' | 'custom',
  ): Promise<User> {
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

    console.log(
      `✅ [UserService] Updated goal for user ${user.username} (FID: ${fid}): ${goal}`,
    );
    return user;
  }

  /**
   * Deletes a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to delete.
   * @returns {Promise<boolean>} Returns true if the user was successfully deleted.
   * @throws {Error} If the user with the specified ID is not found.
   */
  async delete(fid: User['fid']): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: {
        fid,
      },
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found.`);
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
    limit: number = 200,
  ): Promise<{
    runs: RunningSession[];
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
    const runs = await this.runningSessionRepository.find({
      where: { fid },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
      relations: ['user'],
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      runs,
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
   * Get 10 random runs from the running session repository (for debugging/inspection)
   */
  async getRandomRuns(): Promise<RunningSession[]> {
    // Use a random offset for MySQL, or ORDER BY RAND() for small tables
    return this.runningSessionRepository.find({
      order: { createdAt: 'ASC' }, // fallback order
      take: 10,
      relations: ['user'],
    });
    // For large tables, you may want to use a more efficient random sampling method
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
   *     totalWorkouts: number;
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
      totalWorkouts: number;
    };
    runs: RunningSession[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  } | null> {
    // Get the target user
    const user = await this.userRepository.findOne({
      where: { fid },
      select: ['fid', 'username', 'pfpUrl'],
    });

    if (!user) {
      return null;
    }

    // Get user's running sessions for stats calculation
    const allSessions = await this.runningSessionRepository.find({
      where: { fid },
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });

    // Calculate statistics from all sessions
    let stats;
    if (allSessions.length > 0) {
      stats = this.calculateUserStats(allSessions);
    } else {
      stats = {
        totalDistance: 0,
        totalDuration: 0,
        totalWorkouts: 0,
      };
    }

    // Get recent workouts with pagination (max 16)
    let recentWorkouts = {
      runs: [],
      pagination: {
        page: 1,
        limit: 16,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    };

    if (allSessions.length > 0) {
      recentWorkouts = await this.getWorkoutHistory(user.fid, 1, 16);
    }

    return {
      user: {
        fid: user.fid,
        username: user.username,
        pfpUrl: user.pfpUrl,
        displayName: user.username, // Using username as displayName since displayName field doesn't exist
      },
      stats,
      runs: recentWorkouts.runs,
      pagination: recentWorkouts.pagination,
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
        totalWorkouts: 0,
      };
    }

    // Calculate totals
    const totalDistance = sessions.reduce(
      (sum, session) => sum + Number(session.distanceMeters),
      0,
    );
    const totalDuration = sessions.reduce(
      (sum, session) => sum + session.duration,
      0,
    );

    return {
      totalDistance: Math.round(totalDistance * 100) / 100, // Round to 2 decimal places
      totalDuration,
      totalWorkouts: sessions.length,
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
        totalRuns: 0,
        totalDistance: 0,
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
      relations: ['user'],
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
   * Bans a user by setting isBanned to true and bannedAt to current timestamp.
   * This action can only be performed by FID 16098.
   *
   * @param {User['fid']} targetFid - The Farcaster ID of the user to ban
   * @param {User['fid']} adminFid - The Farcaster ID of the admin performing the ban
   * @param {string} [reason] - Optional reason for the ban
   * @returns {Promise<User>} The updated user entity
   * @throws {Error} If the admin is not authorized or user is not found
   */

  private readonly ADMIN_FIDS = [16098, 473065, 7464, 248111];
  async banUser(
    targetFid: User['fid'],
    adminFid: User['fid'],
    reason?: string,
  ): Promise<User> {
    // Check if the admin is authorized (only FID 16098 can ban)
    if (!this.ADMIN_FIDS.includes(adminFid)) {
      throw new Error(
        `Unauthorized: Only ${this.ADMIN_FIDS.join(', ')} can ban users`,
      );
    }

    // Find the target user
    const user = await this.userRepository.findOne({
      where: { fid: targetFid },
    });

    if (!user) {
      throw new Error(`User with FID ${targetFid} not found`);
    }

    // Check if user is already banned
    if (user.isBanned) {
      throw new Error(`User with FID ${targetFid} is already banned`);
    }

    // Ban the user
    user.isBanned = true;
    user.bannedAt = new Date();

    await this.userRepository.save(user);

    console.log(
      `🚫 [UserService] User ${user.username} (FID: ${targetFid}) has been banned by admin (FID: ${adminFid})${reason ? ` - Reason: ${reason}` : ''}`,
    );

    return user;
  }

  /**
   * Unbans a user by setting isBanned to false and clearing bannedAt.
   * This action can only be performed by FID 16098.
   *
   * @param {User['fid']} targetFid - The Farcaster ID of the user to unban
   * @param {User['fid']} adminFid - The Farcaster ID of the admin performing the unban
   * @returns {Promise<User>} The updated user entity
   * @throws {Error} If the admin is not authorized or user is not found
   */
  async unbanUser(
    targetFid: User['fid'],
    adminFid: User['fid'],
  ): Promise<User> {
    // Check if the admin is authorized (only FID 16098 can unban)
    if (!this.ADMIN_FIDS.includes(adminFid)) {
      throw new Error(
        `Unauthorized: Only ${this.ADMIN_FIDS.join(', ')} can unban users`,
      );
    }

    // Find the target user
    const user = await this.userRepository.findOne({
      where: { fid: targetFid },
    });

    if (!user) {
      throw new Error(`User with FID ${targetFid} not found`);
    }

    // Check if user is actually banned
    if (!user.isBanned) {
      throw new Error(`User with FID ${targetFid} is not banned`);
    }

    // Unban the user
    user.isBanned = false;
    user.bannedAt = null;

    await this.userRepository.save(user);

    console.log(
      `✅ [UserService] User ${user.username} (FID: ${targetFid}) has been unbanned by admin (FID: ${adminFid})`,
    );

    return user;
  }
}
