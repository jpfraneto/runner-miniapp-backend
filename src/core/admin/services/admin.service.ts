// src/core/admin/services/admin.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import {
  User,
  UserRoleEnum,
  TrainingPlan,
  PlannedSession,
  UserStats,
  WeeklyTrainingPlan,
  PlanStatusEnum,
  GoalTypeEnum,
} from '../../../models';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TrainingPlan)
    private readonly trainingPlanRepository: Repository<TrainingPlan>,
    @InjectRepository(PlannedSession)
    private readonly plannedSessionRepository: Repository<PlannedSession>,
    @InjectRepository(UserStats)
    private readonly userStatsRepository: Repository<UserStats>,
    @InjectRepository(WeeklyTrainingPlan)
    private readonly weeklyTrainingPlanRepository: Repository<WeeklyTrainingPlan>,
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
  async getUserById(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user
   */
  async updateUser(id: number, updateData: Partial<User>): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
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
  async deleteUser(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new Error('User not found');
    }

    await this.userRepository.remove(user);
    console.log(`User ${id} deleted successfully`);
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
  async promoteToAdmin(id: number): Promise<User> {
    return this.updateUser(id, { role: UserRoleEnum.ADMIN });
  }

  /**
   * Demote admin to user
   */
  async demoteToUser(id: number): Promise<User> {
    return this.updateUser(id, { role: UserRoleEnum.USER });
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
      .addSelect('AVG(user.runnerTokens)', 'average')
      .where('user.runnerTokens > 0')
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
      select: ['id', 'fid', 'username', 'pfpUrl', 'runnerTokens', 'createdAt'],
      order: { runnerTokens: 'DESC' },
      take: limit,
    });
  }

  /**
   * Reset user tokens
   */
  async resetUserTokens(id: number): Promise<User> {
    return this.updateUser(id, { runnerTokens: 0 });
  }

  /**
   * Update user tokens
   */
  async updateUserTokens(id: number, tokens: number): Promise<User> {
    return this.updateUser(id, { runnerTokens: tokens });
  }

  /**
   * Get users with notifications enabled
   */
  async getUsersWithNotifications(): Promise<User[]> {
    return this.userRepository.find({
      where: { notificationsEnabled: true },
      select: ['id', 'fid', 'username', 'notificationToken', 'notificationUrl'],
    });
  }

  /**
   * Disable user notifications
   */
  async disableUserNotifications(id: number): Promise<User> {
    return this.updateUser(id, {
      notificationsEnabled: false,
      notificationToken: null,
      notificationUrl: null,
    });
  }

  /**
   * Reset user's workout validation status (unban and reset invalid submissions)
   */
  async resetUserValidationStatus(id: number): Promise<User> {
    return this.updateUser(id, {
      invalidWorkoutSubmissions: 0,
      isBanned: false,
      bannedAt: null,
      banExpiresAt: null,
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
  // TRAINING PLAN MANAGEMENT
  // ================================

  /**
   * Get all training plans with pagination
   */
  async getAllTrainingPlans(
    page: number = 1,
    limit: number = 50,
    status?: PlanStatusEnum,
  ): Promise<[TrainingPlan[], number]> {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    return this.trainingPlanRepository.findAndCount({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  /**
   * Get training plan by ID
   */
  async getTrainingPlanById(id: number): Promise<TrainingPlan> {
    const plan = await this.trainingPlanRepository.findOne({
      where: { id },
      relations: ['user', 'weeklyMissions'],
    });

    if (!plan) {
      throw new Error('Training plan not found');
    }

    return plan;
  }

  /**
   * Update training plan status
   */
  async updateTrainingPlanStatus(
    id: number,
    status: PlanStatusEnum,
  ): Promise<TrainingPlan> {
    const plan = await this.trainingPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new Error('Training plan not found');
    }

    plan.status = status;
    return this.trainingPlanRepository.save(plan);
  }

  /**
   * Get training plan statistics
   */
  async getTrainingPlanStats(): Promise<{
    totalPlans: number;
    activePlans: number;
    completedPlans: number;
    pausedPlans: number;
    averageStreak: number;
  }> {
    const [totalPlans, activePlans, completedPlans, pausedPlans] =
      await Promise.all([
        this.trainingPlanRepository.count(),
        this.trainingPlanRepository.count({
          where: { status: PlanStatusEnum.ACTIVE },
        }),
        this.trainingPlanRepository.count({
          where: { status: PlanStatusEnum.COMPLETED },
        }),
        this.trainingPlanRepository.count({
          where: { status: PlanStatusEnum.PAUSED },
        }),
      ]);

    const averageStreakResult = await this.trainingPlanRepository
      .createQueryBuilder('plan')
      .select('AVG(plan.currentStreak)', 'average')
      .getRawOne();

    const averageStreak = parseFloat(averageStreakResult?.average || '0');

    return {
      totalPlans,
      activePlans,
      completedPlans,
      pausedPlans,
      averageStreak,
    };
  }

  // ================================
  // WEEKLY TRAINING PLAN MANAGEMENT
  // ================================

  /**
   * Get all weekly training plans with pagination
   */
  async getAllWeeklyTrainingPlans(
    page: number = 1,
    limit: number = 50,
  ): Promise<[WeeklyTrainingPlan[], number]> {
    const skip = (page - 1) * limit;

    return this.weeklyTrainingPlanRepository.findAndCount({
      relations: ['trainingPlan'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }

  /**
   * Get weekly training plan by ID
   */
  async getWeeklyTrainingPlanById(id: number): Promise<WeeklyTrainingPlan> {
    const week = await this.weeklyTrainingPlanRepository.findOne({
      where: { id },
      relations: ['trainingPlan', 'completedRuns'],
    });

    if (!week) {
      throw new Error('Weekly training plan not found');
    }

    return week;
  }

  /**
   * Get weekly training plan statistics
   */
  async getWeeklyTrainingPlanStats(): Promise<{
    totalWeeks: number;
    completedWeeks: number;
    completionRate: number;
    averageCompletedRuns: number;
  }> {
    const totalWeeks = await this.weeklyTrainingPlanRepository.count();
    const completedWeeks = await this.weeklyTrainingPlanRepository.count({
      where: { isCompleted: true },
    });

    const averageCompletedRunsResult = await this.weeklyTrainingPlanRepository
      .createQueryBuilder('week')
      .select('AVG(week.completedRuns)', 'average')
      .getRawOne();

    const averageCompletedRuns = parseFloat(
      averageCompletedRunsResult?.average || '0',
    );
    const completionRate =
      totalWeeks > 0 ? (completedWeeks / totalWeeks) * 100 : 0;

    return {
      totalWeeks,
      completedWeeks,
      completionRate,
      averageCompletedRuns,
    };
  }

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
  async getRunningSessionById(id: number): Promise<RunningSession> {
    const session = await this.runningSessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new Error(`Running session with ID ${id} not found`);
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
  async getCompletedRunById(id: number): Promise<RunningSession> {
    const session = await this.runningSessionRepository.findOne({
      where: { id },
    });
    if (!session) {
      throw new Error(`Completed run (RunningSession) with ID ${id} not found`);
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
}
