// src/core/admin/services/admin.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User, UserRoleEnum } from '../../../models';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
  ) {
    console.log('AdminService initialized');
  }

  // ================================
  // USER MANAGEMENT
  // ================================

  /**
   * Get all users with pagination and search
   */
  async getAllUsers(
    page: number = 1,
    limit: number = 50,
    search: string = '',
  ): Promise<[User[], number]> {
    const skip = (page - 1) * limit;

    return this.userRepository.findAndCount({
      where: search ? { username: Like(`%${search}%`) } : {},
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(fid: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { fid },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user
   */
  async updateUser(fid: number, updateData: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { fid },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Update user fields
    Object.assign(user, updateData);

    const savedUser = await this.userRepository.save(user);
    console.log('User updated successfully:', savedUser);
    return savedUser;
  }

  /**
   * Delete user
   */
  async deleteUser(fid: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { fid } });

    if (!user) {
      throw new Error('User not found');
    }

    await this.userRepository.remove(user);
    console.log(`User ${fid} deleted successfully`);
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role: UserRoleEnum): Promise<User[]> {
    return this.userRepository.find({
      where: { role },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get admin users
   */
  async getAdminUsers(): Promise<User[]> {
    return this.getUsersByRole(UserRoleEnum.ADMIN);
  }

  /**
   * Promote user to admin
   */
  async promoteToAdmin(fid: number): Promise<User> {
    return this.updateUser(fid, { role: UserRoleEnum.ADMIN });
  }

  /**
   * Demote admin to user
   */
  async demoteToUser(fid: number): Promise<User> {
    return this.updateUser(fid, { role: UserRoleEnum.USER });
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    adminUsers: number;
    regularUsers: number;
    usersWithTokens: number;
    averageTokens: number;
    activeRunners: number;
    totalRuns: number;
    totalDistance: number;
  }> {
    const [totalUsers, adminUsers, regularUsers] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { role: UserRoleEnum.ADMIN } }),
      this.userRepository.count({ where: { role: UserRoleEnum.USER } }),
    ]);

    const usersWithTokensResult = await this.userRepository
      .createQueryBuilder('user')
      .select('COUNT(*)', 'count')
      .getRawOne();

    const usersWithTokens = parseInt(usersWithTokensResult?.count || '0');
    const averageTokens = parseFloat(usersWithTokensResult?.average || '0');

    // Get running statistics
    const activeRunners = await this.userRepository.count({
      where: { totalRuns: { $gt: 0 } } as any,
    });

    const totalRunsResult = await this.userRepository
      .createQueryBuilder('user')
      .select('SUM(user.totalRuns)', 'total')
      .getRawOne();

    const totalDistanceResult = await this.userRepository
      .createQueryBuilder('user')
      .select('SUM(user.totalDistance)', 'total')
      .getRawOne();

    const totalRuns = parseInt(totalRunsResult?.total || '0');
    const totalDistance = parseFloat(totalDistanceResult?.total || '0');

    return {
      totalUsers,
      adminUsers,
      regularUsers,
      usersWithTokens,
      averageTokens,
      activeRunners,
      totalRuns,
      totalDistance,
    };
  }

  /**
   * Get top users by tokens
   */
  async getTopUsers(limit: number = 10): Promise<User[]> {
    return this.userRepository.find({
      select: ['fid', 'username', 'pfpUrl', 'createdAt'],
      order: { totalRuns: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get users with notifications enabled
   */
  async getUsersWithNotifications(): Promise<User[]> {
    return this.userRepository.find({
      where: { notificationsEnabled: true },
      select: ['fid', 'username', 'notificationToken', 'notificationUrl'],
    });
  }

  /**
   * Disable user notifications
   */
  async disableUserNotifications(fid: number): Promise<User> {
    return this.updateUser(fid, {
      notificationsEnabled: false,
      notificationToken: null,
      notificationUrl: null,
    });
  }

  /**
   * Reset user's workout validation status (unban and reset invalid submissions)
   */
  async resetUserValidationStatus(fid: number): Promise<User> {
    return this.updateUser(fid, {
      invalidWorkoutSubmissions: 0,
      isBanned: false,
      bannedAt: null,
    });
  }

  /**
   * Get users with validation issues (banned or high invalid submissions)
   */
  async getUsersWithValidationIssues(): Promise<User[]> {
    return this.userRepository.find({
      where: [
        { isBanned: true },
        { invalidWorkoutSubmissions: 2 }, // Users with 2 invalid submissions (1 more and they're banned)
      ],
      order: { invalidWorkoutSubmissions: 'DESC', bannedAt: 'DESC' },
    });
  }

  // ================================
  // TRAINING PLAN MANAGEMENT (DISABLED - Models have been removed)
  // ================================

  // Note: All TrainingPlan and WeeklyTrainingPlan related methods have been commented out
  // because the models have been deleted from the codebase

  // /**
  //  * Get all training plans with pagination
  //  */
  // async getAllTrainingPlans(
  //   page: number = 1,
  //   limit: number = 50,
  //   status?: PlanStatusEnum,
  // ): Promise<[TrainingPlan[], number]> {
  //   const skip = (page - 1) * limit;
  //   const where = status ? { status } : {};
  //   return this.trainingPlanRepository.findAndCount({
  //     where,
  //     relations: ['user'],
  //     order: { createdAt: 'DESC' },
  //     skip,
  //     take: limit,
  //   });
  // }

  // ... All other training plan related methods have been disabled ...

  // ================================
  // RUNNING SESSION MANAGEMENT
  // ================================

  /**
   * Get all running sessions with pagination
   */
  async getAllRunningSessions(
    page: number = 1,
    limit: number = 50,
  ): Promise<[RunningSession[], number]> {
    const skip = (page - 1) * limit;

    return this.runningSessionRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  /**
   * Get running session by ID
   */
  async getRunningSessionById(castHash: string): Promise<RunningSession> {
    const session = await this.runningSessionRepository.findOne({
      where: { castHash },
    });

    if (!session) {
      throw new Error(`Running session with castHash ${castHash} not found`);
    }

    return session;
  }

  /**
   * Get running session statistics
   */
  async getRunningSessionStats(): Promise<{
    totalSessions: number;
    averageDistance: number;
    averageDuration: number;
    averageCompletedSessions: number;
  }> {
    const totalSessions = await this.runningSessionRepository.count();

    const statsResult = await this.runningSessionRepository
      .createQueryBuilder('rs')
      .select('AVG(rs.distance)', 'averageDistance')
      .addSelect('AVG(rs.duration)', 'averageDuration')
      .getRawOne();

    const averageDistance = parseFloat(statsResult?.averageDistance || '0');
    const averageDuration = parseFloat(statsResult?.averageDuration || '0');

    // For now, assume all sessions are completed since we simplified the model
    const averageCompletedSessions = totalSessions;

    return {
      totalSessions,
      averageDistance,
      averageDuration,
      averageCompletedSessions,
    };
  }

  // ================================
  // COMPLETED RUN MANAGEMENT (using RunningSession)
  // ================================

  /**
   * Get all completed runs (RunningSessions) with pagination
   */
  async getAllCompletedRuns(
    page: number = 1,
    limit: number = 50,
  ): Promise<[RunningSession[], number]> {
    const skip = (page - 1) * limit;
    return this.runningSessionRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  /**
   * Get completed run (RunningSession) by ID
   */
  async getCompletedRunById(castHash: string): Promise<RunningSession> {
    const session = await this.runningSessionRepository.findOne({
      where: { castHash },
    });
    if (!session) {
      throw new Error(
        `Completed run (RunningSession) with castHash ${castHash} not found`,
      );
    }
    return session;
  }

  /**
   * Get completed run statistics (RunningSession stats)
   */
  async getCompletedRunStats(): Promise<{
    totalCompletedRuns: number;
    averageDistance: number;
    averageDuration: number;
  }> {
    const totalCompletedRuns = await this.runningSessionRepository.count();
    const statsResult = await this.runningSessionRepository
      .createQueryBuilder('rs')
      .select('AVG(rs.distance)', 'averageDistance')
      .addSelect('AVG(rs.duration)', 'averageDuration')
      .getRawOne();
    const averageDistance = parseFloat(statsResult?.averageDistance || '0');
    const averageDuration = parseFloat(statsResult?.averageDuration || '0');
    return {
      totalCompletedRuns,
      averageDistance,
      averageDuration,
    };
  }

  // ================================
  // ADMIN MODERATION ACTIONS
  // ================================

  /**
   * Delete a run by castHash and update user stats
   */
  async deleteRun(castHash: string): Promise<void> {
    const session = await this.runningSessionRepository.findOne({
      where: { castHash },
      relations: ['user'],
    });

    if (!session) {
      throw new Error(`Run with castHash ${castHash} not found`);
    }

    const user = session.user;

    // Update user stats by subtracting this run's data
    if (session.distanceMeters && session.duration) {
      user.totalRuns = Math.max(0, user.totalRuns - 1);
      user.totalDistance = Math.max(
        0,
        user.totalDistance - session.distanceMeters / 1000,
      );
      user.totalTimeMinutes = Math.max(
        0,
        user.totalTimeMinutes - session.duration,
      );

      await this.userRepository.save(user);
    }

    // Delete the running session
    await this.runningSessionRepository.remove(session);
    console.log(`Run ${castHash} deleted and user stats updated`);
  }

  /**
   * Ban a user by FID and delete all their runs
   */
  async banUser(fid: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { fid },
      relations: ['runningSessions'],
    });

    if (!user) {
      throw new Error(`User with FID ${fid} not found`);
    }

    // Delete all running sessions (this will cascade delete leaderboard entries due to foreign key constraints)
    if (user.runningSessions && user.runningSessions.length > 0) {
      await this.runningSessionRepository.remove(user.runningSessions);
      console.log(
        `Deleted ${user.runningSessions.length} runs for user ${fid}`,
      );
    }

    // Reset user stats and ban them
    user.totalRuns = 0;
    user.totalDistance = 0;
    user.totalTimeMinutes = 0;
    user.currentStreak = 0;
    user.longestStreak = 0;
    user.isBanned = true;
    user.bannedAt = new Date();

    const bannedUser = await this.userRepository.save(user);
    console.log(`User ${fid} banned and all data deleted`);

    return bannedUser;
  }
}
