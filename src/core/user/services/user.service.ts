// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Models
import { User, UserRoleEnum } from '../../../models';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';

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
    users: User[];
    lastUpdated: Date;
    total: number;
  } | null = null;

  /**
   * Cache TTL in milliseconds (15 minutes)
   */
  private readonly CACHE_TTL = 15 * 60 * 1000;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
  ) {}

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
   * @returns {Promise<LeaderboardResponse>} The leaderboard data
   */
  async getFitnessLeaderboard(
    page: number,
    limit: number,
    currentUserFid: number,
  ): Promise<LeaderboardResponse> {
    await this.refreshLeaderboardCacheIfNeeded();

    const skip = (page - 1) * limit;
    const users = this.leaderboardCache!.users.slice(skip, skip + limit);
    const total = this.leaderboardCache!.total;
    const totalPages = Math.ceil(total / limit);

    let currentUser: LeaderboardResponse['currentUser'] | undefined;

    if (currentUserFid) {
      const currentUserIndex = this.leaderboardCache!.users.findIndex(
        (user) => user.fid === currentUserFid,
      );

      if (currentUserIndex !== -1) {
        const user = this.leaderboardCache!.users[currentUserIndex];
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
  private async refreshLeaderboardCacheIfNeeded(): Promise<void> {
    const now = new Date();
    const shouldRefresh =
      !this.leaderboardCache ||
      now.getTime() - this.leaderboardCache.lastUpdated.getTime() >
        this.CACHE_TTL;

    if (shouldRefresh) {
      await this.refreshLeaderboardCache();
    }
  }

  /**
   * Refreshes the leaderboard cache by querying all users sorted by points.
   *
   * @private
   */
  private async refreshLeaderboardCache(): Promise<void> {
    try {
      const users = await this.userRepository.find({
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

      this.leaderboardCache = {
        users,
        total: users.length,
        lastUpdated: new Date(),
      };

      console.log(
        `✅ [UserService] Leaderboard cache refreshed with ${users.length} users`,
      );
    } catch (error) {
      console.error(
        '❌ [UserService] Failed to refresh leaderboard cache:',
        error,
      );
      // Keep old cache if refresh fails
    }
  }

  /**
   * Invalidates the leaderboard cache, forcing a refresh on next request.
   */
  public invalidateLeaderboardCache(): void {
    this.leaderboardCache = null;
    console.log('🔄 [UserService] Leaderboard cache invalidated');
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
