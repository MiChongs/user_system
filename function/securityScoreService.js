const { User } = require('../models/user');
const { UserLog } = require('../models/userLog');
const { Op } = require('sequelize');
const dayjs = require('./dayjs');

class SecurityScoreService {
    /**
     * 计算用户安全分数
     * @param {Object} options 选项
     * @param {number} options.appid 应用ID
     * @param {number} options.userId 用户ID
     * @returns {Promise<Object>} 安全评分详情
     */
    static async calculateUserScore(options) {
        const { appid, userId } = options;

        // 获取用户信息
        const user = await User.findOne({
            where: { id: userId, appid }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // 基础分数 (60分)
        let score = 60;
        const details = {};

        // 1. 账号绑定评分 (最高20分)
        const bindingScore = await this.calculateBindingScore(user);
        score += bindingScore.score;
        details.binding = bindingScore;

        // 2. 登录安全评分 (最高10分)
        const loginScore = await this.calculateLoginScore(user);
        score += loginScore.score;
        details.login = loginScore;

        // 3. 风险操作评分 (最高扣20分)
        const riskScore = await this.calculateRiskScore(user);
        score += riskScore.score;
        details.risk = riskScore;

        // 4. 活跃度评分 (最高10分)
        const activityScore = await this.calculateActivityScore(user);
        score += activityScore.score;
        details.activity = activityScore;

        // 确保分数在0-100之间
        score = Math.max(0, Math.min(100, Math.round(score)));

        // 计算安全等级
        const level = this.calculateSecurityLevel(score);

        return {
            score,
            level,
            details,
            suggestions: this.generateSuggestions(details)
        };
    }

    /**
     * 计算账号绑定得分
     * @private
     */
    static async calculateBindingScore(user) {
        let score = 0;
        const details = {
            email: !!user.email,
            phone: !!user.phone,
            qq: !!user.open_qq,
            wechat: !!user.open_wechat,
            twoFactor: !!user.twoFactorSecret
        };

        // 邮箱绑定 (5分)
        if (details.email) score += 5;
        
        // 手机绑定 (5分)
        if (details.phone) score += 5;
        
        // 社交账号绑定 (每个2分)
        if (details.qq) score += 2;
        if (details.wechat) score += 2;
        
        // 两步验证 (6分)
        if (details.twoFactor) score += 6;

        return {
            score,
            details,
            maxScore: 20
        };
    }

    /**
     * 计算登录安全得分
     * @private
     */
    static async calculateLoginScore(user) {
        let score = 0;
        const details = {};

        // 获取最近登录记录
        const recentLogins = await UserLog.findAll({
            where: {
                userId: user.id,
                type: 'login',
                time: {
                    [Op.gte]: dayjs().subtract(30, 'days').toDate()
                }
            }
        });

        // 检查登录IP分散度
        const uniqueIPs = new Set(recentLogins.map(log => log.ip)).size;
        details.ipDiversity = uniqueIPs;
        if (uniqueIPs <= 2) score += 5;
        else if (uniqueIPs <= 4) score += 3;

        // 检查登录时间规律性
        const loginTimes = recentLogins.map(log => dayjs(log.time).hour());
        const timeDeviation = this.calculateTimeDeviation(loginTimes);
        details.timeRegularity = timeDeviation;
        if (timeDeviation < 4) score += 5;
        else if (timeDeviation < 8) score += 3;

        return {
            score,
            details,
            maxScore: 10
        };
    }

    /**
     * 计算风险操作得分
     * @private
     */
    static async calculateRiskScore(user) {
        let score = 0;
        const details = {};

        // 获取高风险操作记录
        const riskLogs = await UserLog.findAll({
            where: {
                userId: user.id,
                risk_level: 'high',
                time: {
                    [Op.gte]: dayjs().subtract(90, 'days').toDate()
                }
            }
        });

        details.highRiskCount = riskLogs.length;

        // 根据高风险操作次数扣分
        if (riskLogs.length === 0) score = 0;
        else if (riskLogs.length <= 2) score = -5;
        else if (riskLogs.length <= 5) score = -10;
        else score = -20;

        return {
            score,
            details,
            maxScore: 0
        };
    }

    /**
     * 计算活跃度得分
     * @private
     */
    static async calculateActivityScore(user) {
        let score = 0;
        const details = {};

        // 获取最近活动记录
        const recentActivity = await UserLog.findAll({
            where: {
                userId: user.id,
                time: {
                    [Op.gte]: dayjs().subtract(30, 'days').toDate()
                }
            }
        });

        // 计算活跃天数
        const activeDays = new Set(
            recentActivity.map(log => dayjs(log.time).format('YYYY-MM-DD'))
        ).size;

        details.activeDays = activeDays;

        // 根据活跃天数评分
        if (activeDays >= 20) score = 10;
        else if (activeDays >= 10) score = 7;
        else if (activeDays >= 5) score = 5;
        else score = 3;

        return {
            score,
            details,
            maxScore: 10
        };
    }

    /**
     * 计算安全等级
     * @private
     */
    static calculateSecurityLevel(score) {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'good';
        if (score >= 70) return 'fair';
        if (score >= 60) return 'poor';
        return 'risk';
    }

    /**
     * 生成安全建议
     * @private
     */
    static generateSuggestions(details) {
        const suggestions = [];

        // 绑定相关建议
        if (!details.binding.details.email) {
            suggestions.push('建议绑定邮箱以提高账号安全性');
        }
        if (!details.binding.details.twoFactor) {
            suggestions.push('建议开启两步验证以加强账号保护');
        }

        // 登录安全建议
        if (details.login.details.ipDiversity > 4) {
            suggestions.push('检测到多个登录地点，建议检查登录设备');
        }

        // 风险操作建议
        if (details.risk.details.highRiskCount > 0) {
            suggestions.push('存在高风险操作，建议检查账号安全');
        }

        // 活跃度建议
        if (details.activity.details.activeDays < 5) {
            suggestions.push('建议定期登录以维持账号活跃度');
        }

        return suggestions;
    }

    /**
     * 计算时间偏差
     * @private
     */
    static calculateTimeDeviation(times) {
        if (times.length === 0) return 24;
        
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const deviation = Math.sqrt(
            times.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / times.length
        );
        
        return deviation;
    }
}

module.exports = SecurityScoreService; 