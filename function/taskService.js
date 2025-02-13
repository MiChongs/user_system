const schedule = require('node-schedule');
const { Task } = require('../models/task');
const { User } = require('../models/user');
const SystemLogService = require('./systemLogService');
const { Op } = require('sequelize');
const dayjs = require('dayjs');

class TaskService {
    constructor() {
        this.scheduledJobs = new Map();
    }

    async loadTasks() {
        const tasks = await Task.findAll({ where: { status: 'active' } });
        tasks.forEach(task => this.scheduleTask(task));
    }

    scheduleTask(task) {
        if (this.scheduledJobs.has(task.id)) {
            this.scheduledJobs.get(task.id).cancel();
        }

        let job;
        if (task.executionDate) {
            job = schedule.scheduleJob(task.executionDate, async () => {
                await this.executeTask(task);
            });
        } else {
            job = schedule.scheduleJob(task.schedule, async () => {
                await this.executeTask(task);
            });
        }

        this.scheduledJobs.set(task.id, job);
    }

    async executeTask(task) {
        try {
            console.log(`执行任务: ${task.name}`);
            await this.executeTaskAction(task);
            task.lastRun = new Date();
            await task.save();
            await SystemLogService.logTaskExecution(task.name, 'success', 0, { action: task.action });
        } catch (error) {
            console.error(`任务执行失败: ${task.name}`, error);
            await SystemLogService.logTaskExecution(task.name, 'failed', 0, { error: error.message });
        }
    }

    async executeTaskAction(task) {
        switch (task.action) {
            case 'distributeRewards':
                await this.distributeRewards(task.conditions, task.rewardType, task.rewardAmount, task.rewardUnit);
                break;
            default:
                throw new Error(`未知的动作: ${task.action}`);
        }
    }

    async distributeRewards(conditions, rewardType, rewardAmount, rewardUnit) {
        const where = {};
        if (conditions) {
            if (conditions.lastLogin) {
                where.lastLogin = { [Op.gte]: new Date(conditions.lastLogin) };
            }
            if (conditions.userId) {
                where.id = conditions.userId;
            }
            if (conditions.account) {
                where.account = { [Op.like]: `%${conditions.account}%` };
            }
            if (conditions.name) {
                where.name = { [Op.like]: `%${conditions.name}%` };
            }
            if (conditions.email) {
                where.email = { [Op.like]: `%${conditions.email}%` };
            }
            if (conditions.registerTime) {
                where.register_time = { [Op.gte]: new Date(conditions.registerTime) };
            }
            if (conditions.experience) {
                where.experience = { [Op.gte]: conditions.experience };
            }
            if (conditions.enabled) {
                where.enabled = conditions.enabled;
            }
        }

        const users = await User.findAll({ where });
        for (const user of users) {
            if (rewardType === 'integral') {
                user.integral += parseInt(rewardAmount);
            } else if (rewardType === 'membership') {
                let expirationDate = dayjs(user.membershipExpiration || new Date());
                switch (rewardUnit) {
                    case 'minutes':
                        expirationDate = expirationDate.add(rewardAmount, 'minute');
                        break;
                    case 'hours':
                        expirationDate = expirationDate.add(rewardAmount, 'hour');
                        break;
                    case 'days':
                        expirationDate = expirationDate.add(rewardAmount, 'day');
                        break;
                    case 'months':
                        expirationDate = expirationDate.add(rewardAmount, 'month');
                        break;
                    case 'years':
                        expirationDate = expirationDate.add(rewardAmount, 'year');
                        break;
                    case 'permanent':
                        expirationDate = null; // 永久会员
                        break;
                }
                user.membershipExpiration = expirationDate.unix() ? expirationDate.unix() : 999999999;
            }
            await user.save();
            await SystemLogService.createLog({
                type: 'info',
                content: `用户 ${user.id} 获得奖励`,
                details: { userId: user.id, rewardType, rewardAmount, rewardUnit }
            });
        }
    }

    async createTask(taskData) {
        const task = await Task.create(taskData);
        this.scheduleTask(task);
        return task;
    }

    async updateTask(id, updates) {
        const task = await Task.findByPk(id);
        if (!task) throw new Error('任务未找到');
        Object.assign(task, updates);
        await task.save();
        this.scheduleTask(task);
        return task;
    }

    async deleteTask(id) {
        const task = await Task.findByPk(id);
        if (!task) throw new Error('任务未找到');
        if (this.scheduledJobs.has(id)) {
            this.scheduledJobs.get(id).cancel();
            this.scheduledJobs.delete(id);
        }
        await task.destroy();
    }
}

module.exports = new TaskService(); 