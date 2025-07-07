// Dependencies
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Models
import { User, UserRoleEnum } from '../../../models';
import {
  CompletedRun,
  RunStatusEnum,
} from '../../../models/CompletedRun/CompletedRun.model';
import { logger } from 'src/main';

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
    @InjectRepository(CompletedRun)
    private readonly completedRunRepository: Repository<CompletedRun>,
  ) {}

  /**
   * Retrieves a user by their ID with optional selected fields and relations.
   *
   * @param {User['id']} id - The ID of the user to retrieve.
   * @param {(keyof User)[]} [select=[]] - Optional array of fields to select.
   * @param {(keyof User)[]} [relations=[]] - Optional array of relations to include.
   * @returns {Promise<User | undefined>} The user entity or undefined if not found.
   */
  async getById(
    id: User['id'],
    select: (keyof User)[] = [],
    relations: (keyof User)[] = [],
  ): Promise<User | undefined> {
    return this.userRepository.findOne({
      ...(select.length > 0 && {
        select,
      }),
      where: {
        id,
      },
      ...(relations.length > 0 && {
        relations,
      }),
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
   * Gets the user's workout history
   *
   * @param {User['id']} userId - The ID of the user
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Number of runs per page (default: 50)
   * @returns {Promise<any>} The user's workout history
   */
  async getWorkoutHistory(
    userId: User['id'],
    page: number = 1,
    limit: number = 50,
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [runs, total] = await this.completedRunRepository.findAndCount({
      where: {
        userId,
        status: RunStatusEnum.COMPLETED,
      },
      order: {
        completedDate: 'DESC',
      },
      skip,
      take: limit,
      relations: ['plannedSession', 'trainingPlan'],
    });

    return {
      runs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Gets the user's fitness stats
   *
   * @param {User['id']} userId - The ID of the user
   * @returns {Promise<any>} The user's fitness stats
   */
  async getFitnessStats(userId: User['id']): Promise<any> {
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
   * Gets all users' workout history (public endpoint)
   *
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Number of runs per page (default: 50)
   * @returns {Promise<any>} All users' workout history
   */
  async getAllUsersWorkouts(
    page: number = 1,
    limit: number = 50,
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [runs, total] = await this.completedRunRepository.findAndCount({
      where: {
        status: RunStatusEnum.COMPLETED,
      },
      order: {
        completedDate: 'DESC',
      },
      skip,
      take: limit,
      relations: ['user', 'plannedSession', 'trainingPlan'],
    });

    return {
      runs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }
}
