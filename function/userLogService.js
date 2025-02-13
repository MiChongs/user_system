const { UserLog } = require('../models/userLog');
const { getIpLocation } = require('./ipLocation');
const { Op } = require('sequelize');
const dayjs = require('./dayjs');
const UAParser = require('ua-parser-js');
const iconv = require('iconv-lite');

class UserLogService {
    constructor(options = {}) {
        this.appid = options.appid;
        this.userId = options.userId;
        this.ip = options.ip;
        this.device = options.device;
        this.userAgent = options.userAgent;
        this.startTime = Date.now(); // 用于计算操作耗时
        this.logType = '';
        this.logContent = '';
        this.logDetails = null;
        this.riskLevel = options.riskLevel || 'low';
        this.status = 'success';
        this.errorMessage = null;
    }

    /**
     * 设置操作状态
     * @param {'success'|'failed'|'blocked'} status 状态
     * @param {string} [message] 错误信息
     */
    setStatus(status, message = null) {
        this.status = status;
        this.errorMessage = message;
        return this;
    }

    /**
     * 解析设备和平台信息
     * @private
     */
    parseUserAgent() {
        if (!this.userAgent) return {};
        
        const parser = new UAParser(this.userAgent);
        const result = parser.getResult();
        
        return {
            browser: `${result.browser.name || ''} ${result.browser.version || ''}`.trim(),
            os: `${result.os.name || ''} ${result.os.version || ''}`.trim(),
            device: result.device.type || 'desktop',
            platform: result.engine.name || 'unknown'
        };
    }

    /**
     * 格式化地理位置信息
     * @private
     */
    static formatLocation(locationInfo) {
        if (!locationInfo) return {};
        
        try {
            const encodeGBK = (str) => {
                if (!str) return '';
                return iconv.encode(str, 'gbk').toString('binary');
            };

            return {
                location: encodeGBK(`${locationInfo.country || ''} ${locationInfo.region || ''} ${locationInfo.city || ''}`),
                country: encodeGBK(locationInfo.country || ''),
                region: encodeGBK(locationInfo.region || ''),
                city: encodeGBK(locationInfo.city || ''),
                district: encodeGBK(locationInfo.district || ''),
                isp: encodeGBK(locationInfo.isp || ''),
                coordinates: locationInfo.coordinates,
                timezone: locationInfo.timezone
            };
        } catch (error) {
            console.error('Format location error:', error);
            return {};
        }
    }

    /**
     * 保存日志
     */
    async save() {
        try {
            if (!this.appid || !this.userId || !this.logType || !this.logContent) {
                throw new Error('Missing required log information');
            }

            // 计算操作耗时
            const duration = Date.now() - this.startTime;

            // 获取IP地理位置
            let locationInfo = {};
            if (this.ip) {
                try {
                    const ipLocation = await getIpLocation(this.ip);
                    locationInfo = this.constructor.formatLocation(ipLocation);
                } catch (error) {
                    console.error('Failed to get IP location:', error);
                }
            }

            // 解析设备信息
            const deviceInfo = this.parseUserAgent();

            // 分析风险等级
            const riskLevel = await this.analyzeRiskLevel();

            // 创建日志记录
            return await UserLog.create({
                appid: this.appid,
                userId: this.userId,
                type: this.logType,
                content: this.logContent,
                details: this.logDetails,
                ip: this.ip,
                device: this.device || deviceInfo.device,
                location: locationInfo.location,
                country: locationInfo.country,
                region: locationInfo.region,
                city: locationInfo.city,
                district: locationInfo.district,
                isp: locationInfo.isp,
                coordinates: locationInfo.coordinates,
                timezone: locationInfo.timezone,
                risk_level: riskLevel,
                status: this.status,
                error_message: this.errorMessage,
                duration,
                user_agent: this.userAgent,
                platform: deviceInfo.platform
            });

        } catch (error) {
            console.error('Failed to save user log:', error);
            // 记录失败不应影响主业务流程
            return null;
        }
    }

    /**
     * 批量记录日志
     * @param {Array<Object>} logs 日志数组
     */
    static async batchLog(logs) {
        try {
            const logPromises = logs.map(log => 
                new UserLogService(log)
                    .type(log.type)
                    .content(log.content)
                    .details(log.details)
                    .save()
            );
            
            return await Promise.allSettled(logPromises);
        } catch (error) {
            console.error('Batch log failed:', error);
            return [];
        }
    }

    /**
     * 获取用户操作轨迹
     * @param {Object} query 查询条件
     */
    static async getUserTrail(query) {
        const where = {
            appid: query.appid,
            userId: query.userId
        };

        if (query.startTime && query.endTime) {
            where.time = {
                [Op.between]: [
                    dayjs(query.startTime).startOf('day').toDate(),
                    dayjs(query.endTime).endOf('day').toDate()
                ]
            };
        }

        if (query.type) {
            where.type = query.type;
        }

        if (query.status) {
            where.status = query.status;
        }

        const logs = await UserLog.findAll({
            where,
            order: [['time', 'DESC']],
            limit: query.limit || 100
        });

        return this.formatTrail(logs);
    }

    /**
     * 格式化操作轨迹
     * @private
     */
    static formatTrail(logs) {
        const trail = {
            timeline: [],
            locations: new Set(),
            devices: new Set(),
            riskEvents: []
        };

        logs.forEach(log => {
            // 添加时间线
            trail.timeline.push({
                time: log.time,
                type: log.type,
                content: log.content,
                location: log.location,
                device: log.device,
                status: log.status
            });

            // 收集位置信息
            if (log.location) {
                trail.locations.add(log.location);
            }

            // 收集设备信息
            if (log.device) {
                trail.devices.add(log.device);
            }

            // 收集风险事件
            if (log.risk_level === 'high' || log.status === 'blocked') {
                trail.riskEvents.push({
                    time: log.time,
                    type: log.type,
                    content: log.content,
                    risk_level: log.risk_level,
                    error_message: log.error_message
                });
            }
        });

        // 转换Set为数组
        trail.locations = Array.from(trail.locations);
        trail.devices = Array.from(trail.devices);

        return trail;
    }

    /**
     * 设置风险等级
     * @param {'low'|'medium'|'high'} level 风险等级
     */
    setRiskLevel(level) {
        this.riskLevel = level;
        return this;
    }

    /**
     * 分析操作风险等级
     * @private
     */
    async analyzeRiskLevel() {
        // 根据不同条件判断风险等级
        if (this.logType === 'security' || 
            this.logType === 'password_update' || 
            this.logType === 'status_change') {
            return 'high';
        }
        
        if (this.logType === 'device_login' || 
            this.logType === 'custom_id_update' || 
            this.logType === 'bind') {
            return 'medium';
        }

        return 'low';
    }

    /**
     * 创建日志构建器
     * @param {Object} options 选项
     * @param {number} options.appid 应用ID
     * @param {number} options.userId 用户ID
     * @param {string} options.ip IP地址
     * @param {string} options.device 设备信息
     * @returns {UserLogService}
     */
    static builder(options) {
        return new UserLogService(options);
    }

    /**
     * 设置日志类型
     * @param {string} type 日志类型
     * @returns {UserLogService}
     */
    type(type) {
        this.logType = type;
        return this;
    }

    /**
     * 设置日志内容
     * @param {string} content 日志内容
     * @returns {UserLogService}
     */
    content(content) {
        this.logContent = content;
        return this;
    }

    /**
     * 设置详细信息
     * @param {Object} details 详细信息
     * @returns {UserLogService}
     */
    details(details) {
        this.logDetails = details;
        return this;
    }

    /**
     * 快速记录用户登录
     * @param {Object} options 选项
     * @returns {Promise<UserLog>}
     */
    static async login(options) {
        // 获取IP地理位置
        let locationInfo = {};
        if (options.ip) {
            try {
                locationInfo = await getIpLocation(options.ip);
            } catch (error) {
                console.error('Failed to get IP location:', error);
            }
        }

        return await UserLogService.builder(options)
            .type('login')
            .content('用户登录')
            .details({
                loginType: options.loginType || 'normal',
                deviceInfo: options.device,
                location: locationInfo,
                timestamp: new Date().toISOString()
            })
            .save();
    }

    /**
     * 快速记录用户注册
     * @param {Object} options 选项
     * @returns {Promise<UserLog>}
     */
    static async register(options) {
        let locationInfo = {};
        if (options.ip) {
            try {
                locationInfo = await getIpLocation(options.ip);
            } catch (error) {
                console.error('Failed to get IP location:', error);
            }
        }

        return await UserLogService.builder(options)
            .type('register')
            .content('用户注册')
            .details({
                registerType: options.registerType || 'normal',
                inviteCode: options.inviteCode,
                location: locationInfo,
                timestamp: new Date().toISOString()
            })
            .save();
    }

    /**
     * 快速记录用户信息更新
     * @param {Object} options 选项
     * @param {Object} changes 变更信息
     * @returns {Promise<UserLog>}
     */
    static async infoUpdate(options, changes) {
        let locationInfo = {};
        if (options.ip) {
            try {
                locationInfo = await getIpLocation(options.ip);
            } catch (error) {
                console.error('Failed to get IP location:', error);
            }
        }

        return await UserLogService.builder(options)
            .type('info_update')
            .content('更新用户信息')
            .details({
                changes,
                updateType: options.updateType || 'normal',
                location: locationInfo,
                timestamp: new Date().toISOString()
            })
            .save();
    }

    /**
     * 快速记录账号绑定
     * @param {Object} options 选项
     * @param {string} bindType 绑定类型
     * @returns {Promise<UserLog>}
     */
    static async bind(options, bindType) {
        return await UserLogService.builder(options)
            .type('bind')
            .content(`绑定${bindType}账号`)
            .details({ bindType })
            .save();
    }

    /**
     * 记录用户签到
     * @param {Object} options 选项
     * @param {Object} dailyInfo 签到信息
     */
    static async daily(options, dailyInfo) {
        return await UserLogService.builder(options)
            .type('daily_sign')
            .content('用户签到')
            .details({
                integral: dailyInfo.integral,
                consecutive: dailyInfo.consecutive,
                totalDays: dailyInfo.totalDays
            })
            .save();
    }

    /**
     * 记录用户心跳
     * @param {Object} options 选项
     */
    static async heartbeat(options) {
        return await UserLogService.builder(options)
            .type('heartbeat')
            .content('用户心跳')
            .details({
                timestamp: new Date().toISOString()
            })
            .save();
    }

    /**
     * 记录自定义ID修改
     * @param {Object} options 选项
     * @param {Object} changes 变更信息
     */
    static async customIdUpdate(options, changes) {
        return await UserLogService.builder(options)
            .type('custom_id_update')
            .content('修改自定义ID')
            .details({
                oldId: changes.oldId,
                newId: changes.newId,
                remainingCount: changes.remainingCount
            })
            .save();
    }

    /**
     * 记录密码修改
     * @param {Object} options 选项
     * @param {string} method 修改方式
     */
    static async passwordUpdate(options, method = 'normal') {
        const locationInfo = await this.getLocationInfo(options.ip);
        
        return await UserLogService.builder(options)
            .type('password_update')
            .content('修改密码')
            .setRiskLevel('high')  // 密码修改默认高风险
            .details(this.createDetailsWithLocation({
                method,
                userAgent: options.userAgent
            }, locationInfo))
            .save();
    }

    /**
     * 记录邮箱验证
     * @param {Object} options 选项
     * @param {string} email 邮箱
     */
    static async emailVerify(options, email) {
        return await UserLogService.builder(options)
            .type('email_verify')
            .content('邮箱验证')
            .details({
                email,
                verified: true
            })
            .save();
    }

    /**
     * 记录设备登录
     * @param {Object} options 选项
     * @param {Object} deviceInfo 设备信息
     */
    static async deviceLogin(options, deviceInfo) {
        const locationInfo = await this.getLocationInfo(options.ip);
        
        return await UserLogService.builder(options)
            .type('device_login')
            .content('设备登录')
            .details(this.createDetailsWithLocation({
                deviceId: deviceInfo.markcode,
                deviceName: deviceInfo.device,
                loginTime: deviceInfo.time,
                userAgent: options.userAgent
            }, locationInfo))
            .save();
    }

    /**
     * 记录设备登出
     * @param {Object} options 选项
     * @param {Object} deviceInfo 设备信息
     */
    static async deviceLogout(options, deviceInfo) {
        return await UserLogService.builder(options)
            .type('device_logout')
            .content('设备登出')
            .details({
                deviceId: deviceInfo.markcode,
                deviceName: deviceInfo.device,
                logoutTime: new Date().toISOString()
            })
            .save();
    }

    /**
     * 记录账号状态变更
     * @param {Object} options 选项
     * @param {Object} changes 变更信息
     */
    static async statusChange(options, changes) {
        return await UserLogService.builder(options)
            .type('status_change')
            .content(changes.enabled ? '账号启用' : '账号禁用')
            .details({
                enabled: changes.enabled,
                reason: changes.reason,
                duration: changes.duration,
                endTime: changes.endTime
            })
            .save();
    }

    /**
     * 记录会员状态变更
     * @param {Object} options 选项
     * @param {Object} vipInfo VIP信息
     */
    static async vipChange(options, vipInfo) {
        return await UserLogService.builder(options)
            .type('vip_change')
            .content('会员状态变更')
            .details({
                level: vipInfo.level,
                expireTime: vipInfo.expireTime,
                source: vipInfo.source
            })
            .save();
    }

    /**
     * 记录积分变动
     * @param {Object} options 选项
     * @param {Object} changes 变更信息
     */
    static async integralChange(options, changes) {
        return await UserLogService.builder(options)
            .type('integral_change')
            .content(`积分${changes.amount >= 0 ? '增加' : '减少'}`)
            .details({
                amount: changes.amount,
                reason: changes.reason,
                balance: changes.balance
            })
            .save();
    }

    /**
     * 记录用户操作
     * @param {Object} options 选项
     * @param {Object} operation 操作信息
     */
    static async userOperation(options, operation) {
        return await UserLogService.builder(options)
            .type('user_operation')
            .content(operation.description)
            .details({
                action: operation.action,
                target: operation.target,
                result: operation.result,
                extra: operation.extra
            })
            .save();
    }

    /**
     * 记录安全相关操作
     * @param {Object} options 选项
     * @param {Object} securityInfo 安全信息
     */
    static async security(options, securityInfo) {
        const locationInfo = await this.getLocationInfo(options.ip);
        
        return await UserLogService.builder(options)
            .type('security')
            .content(securityInfo.action)
            .setRiskLevel('high')  // 安全操作默认高风险
            .details(this.createDetailsWithLocation({
                type: securityInfo.type,
                result: securityInfo.result,
                risk: securityInfo.risk,
                userAgent: options.userAgent
            }, locationInfo))
            .save();
    }

    /**
     * 获取用户日志
     * @param {Object} query 查询条件
     * @returns {Promise<Array>}
     */
    static async getUserLogs(query) {
        const where = {
            appid: query.appid,
            userId: query.userId
        };

        if (query.type) {
            where.type = query.type;
        }

        if (query.startTime && query.endTime) {
            where.time = {
                [Op.between]: [query.startTime, query.endTime]
            };
        }

        if (query.riskLevel) {
            where.risk_level = query.riskLevel;
        }

        return await UserLog.findAndCountAll({
            where,
            order: [['time', 'DESC']],
            limit: query.limit || 20,
            offset: query.offset || 0,
            include: [{
                model: User,
                as: 'user',
                attributes: ['name', 'avatar']
            }]
        });
    }

    /**
     * 获取高风险操作日志
     * @param {Object} query 查询条件
     */
    static async getHighRiskLogs(query) {
        return await this.getUserLogs({
            ...query,
            riskLevel: 'high'
        });
    }

    /**
     * 清理过期日志
     * @param {number} days 保留天数
     */
    static async cleanOldLogs(days = 30) {
        const cutoffDate = dayjs().subtract(days, 'days').toDate();
        return await UserLog.destroy({
            where: {
                time: {
                    [Op.lt]: cutoffDate
                },
                risk_level: {
                    [Op.ne]: 'high' // 不删除高风险日志
                }
            }
        });
    }

    /**
     * 快速记录日志（简化版）
     * @param {Object} options 基础选项
     * @param {string} type 日志类型
     * @param {string} content 日志内容
     * @param {Object} [details] 详细信息
     */
    static async quickLog(options, type, content, details = null) {
        if (!options.ip) {
            console.warn('Quick log without IP address may lose location information');
        }

        try {
            // 获取IP地理位置
            let locationInfo = {};
            if (options.ip) {
                try {
                    locationInfo = await getIpLocation(options.ip);
                } catch (error) {
                    console.error('Failed to get IP location:', error);
                }
            }

            // 解析设备信息
            let deviceInfo = {};
            if (options.userAgent) {
                const parser = new UAParser(options.userAgent);
                const result = parser.getResult();
                deviceInfo = {
                    browser: `${result.browser.name || ''} ${result.browser.version || ''}`.trim(),
                    os: `${result.os.name || ''} ${result.os.version || ''}`.trim(),
                    device: result.device.type || 'desktop',
                    platform: result.engine.name || 'unknown'
                };
            }

            console.log(locationInfo);
            // 创建日志记录
            return await UserLog.create({
                appid: options.appid,
                userId: options.userId,
                type,
                content,
                details,
                ip: options.ip,
                device: options.device || deviceInfo.device,
                location: locationInfo.location,
                country: locationInfo.country,
                region: locationInfo.region,
                city: locationInfo.city,
                district: locationInfo.district,
                isp: locationInfo.isp,
                coordinates: locationInfo.coordinates,
                timezone: locationInfo.timezone,
                risk_level: 'low',
                status: 'success',
                user_agent: options.userAgent,
                platform: deviceInfo.platform,
                time: new Date()
            });


        } catch (error) {
            console.error('Quick log failed:', error);
            return null;
        }
    }

    /**
     * 快速记录错误日志
     * @param {Object} options 基础选项
     * @param {string} content 错误内容
     * @param {Error|string} error 错误对象或消息
     */
    static async quickError(options, content, error) {
        const errorDetails = {
            message: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : null,
            time: new Date().toISOString()
        };

        return await this.quickLog(
            options,
            'error',
            content,
            errorDetails
        );
    }

    /**
     * 快速记录错误日志
     * @param {Object} options 基础选项
     * @param {string} type 日志类型
     * @param {string} content 错误内容
     * @param {Error|string} error 错误对象或消息
     */
    static async quickError(options, type, content, error) {
        const errorDetails = {
            message: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : null,
            time: new Date().toISOString()
        };

        return await this.quickLog(
            options,
            type,
            content,
            errorDetails
        );
    }

    /**
     * 快速记录操作日志
     * @param {Object} options 基础选项
     * @param {string} action 操作名称
     * @param {Object} result 操作结果
     */
    static async quickAction(options, action, result = {}) {
        return await this.quickLog(
            options,
            'user_operation',
            action,
            {
                result,
                timestamp: new Date().toISOString()
            }
        );
    }

    /**
     * 快速记录状态变更
     * @param {Object} options 基础选项
     * @param {string} field 变更字段
     * @param {any} oldValue 原值
     * @param {any} newValue 新值
     */
    static async quickChange(options, field, oldValue, newValue) {
        return await this.quickLog(
            options,
            'status_change',
            `${field}变更`,
            {
                field,
                oldValue,
                newValue,
                timestamp: new Date().toISOString()
            }
        );
    }

    /**
     * 获取IP地理位置信息
     * @private
     */
    static async getLocationInfo(ip) {
        if (!ip) return {};
        try {
            return await getIpLocation(ip);
        } catch (error) {
            console.error('Failed to get IP location:', error);
            return {};
        }
    }

    /**
     * 创建带位置信息的日志详情
     * @private
     */
    static createDetailsWithLocation(details = {}, locationInfo = {}) {
        return {
            ...details,
            location: locationInfo,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 解析视频平台类型
     * @private
     * @param {string} url 视频链接
     * @returns {string} 平台类型
     */
    static detectPlatform(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();

            // 抖音
            if (hostname.includes('douyin.com') || 
                hostname.includes('iesdouyin.com') ||
                hostname.includes('tiktok.com')) {
                return 'douyin';
            }

            // 快手
            if (hostname.includes('kuaishou.com') || 
                hostname.includes('gifshow.com') ||
                hostname.includes('chenzhongtech.com')) {
                return 'kuaishou';
            }

            // 小红书
            if (hostname.includes('xiaohongshu.com') || 
                hostname.includes('xhslink.com')) {
                return 'xhs';
            }

            // 微视
            if (hostname.includes('weishi.qq.com')) {
                return 'weishi';
            }

            // 火山
            if (hostname.includes('huoshan.com')) {
                return 'huoshan';
            }

            // 微博
            if (hostname.includes('weibo.com') || 
                hostname.includes('weibo.cn')) {
                return 'weibo';
            }

            // B站
            if (hostname.includes('bilibili.com') || 
                hostname.includes('b23.tv')) {
                return 'bilibili';
            }

            return 'unknown';
        } catch (error) {
            console.error('Failed to detect platform:', error);
            return 'unknown';
        }
    }

    /**
     * 记录内容解析日志
     * @param {Object} options 基础选项
     * @param {Object} content 解析的内容信息
     * @param {string} url 原始URL
     */
    static async logContentAnalysis(options, content, url) {
        try {
            const platform = this.detectPlatform(url);
            const logDetails = {
                platform,
                contentType: content.type || 'video', // video/gallery
                contentId: content.id,
                title: content.title,
                originalUrl: url,
                analysisTime: Date.now(),
                success: true
            };

            return await this.quickLog(
                options,
                'content_analysis',
                `解析${platform}${content.type === 'gallery' ? '图集' : '视频'}`,
                logDetails
            );
        } catch (error) {
            console.error('Failed to log content analysis:', error);
            return await this.quickError(
                options,
                `内容解析失败`,
                error
            );
        }
    }

    /**
     * 记录解析失败日志
     * @param {Object} options 基础选项
     * @param {string} url 原始URL
     * @param {string} platform 平台类型
     * @param {Error} error 错误信息
     */
    static async logAnalysisFailed(options, url, platform, error) {
        const logDetails = {
            platform,
            originalUrl: url,
            errorType: error.name,
            errorMessage: error.message,
            analysisTime: Date.now(),
            success: false
        };

        return await this.quickError(
            options,
            'analysis_failed',
            `${platform}内容解析失败`,
            logDetails
        );
    }

    /**
     * 记录批量解析日志
     * @param {Object} options 基础选项
     * @param {Array} results 批量解析结果
     */
    static async logBatchAnalysis(options, results) {
        const logDetails = {
            totalCount: results.length,
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length,
            platforms: [...new Set(results.map(r => r.platform))],
            analysisTime: Date.now(),
            details: results.map(r => ({
                platform: r.platform,
                contentType: r.type,
                success: r.success,
                contentId: r.id,
                error: r.error
            }))
        };

        return await this.quickLog(
            options,
            'batch_analysis',
            '批量内容解析',
            logDetails
        );
    }

    /**
     * 记录解析统计信息
     * @param {Object} options 基础选项
     * @param {Object} stats 统计信息
     */
    static async logAnalysisStats(options, stats) {
        const logDetails = {
            dailyCount: stats.daily,
            weeklyCount: stats.weekly,
            monthlyCount: stats.monthly,
            platformStats: stats.platforms,
            successRate: stats.successRate,
            averageTime: stats.averageTime,
            timestamp: Date.now()
        };

        return await this.quickLog(
            options,
            'analysis_stats',
            '解析统计信息',
            logDetails
        );
    }

    /**
     * 记录用户解析配额信息
     * @param {Object} options 基础选项
     * @param {Object} quota 配额信息
     */
    static async logQuotaUpdate(options, quota) {
        const logDetails = {
            dailyUsed: quota.used,
            dailyLimit: quota.limit,
            remainingQuota: quota.remaining,
            resetTime: quota.resetTime,
            vipLevel: quota.vipLevel,
            timestamp: Date.now()
        };

        return await this.quickLog(
            options,
            'quota_update',
            '解析配额更新',
            logDetails
        );
    }

    /**
     * Logs an email verification event.
     * @param {Object} options - The options for logging.
     * @param {Object} details - The details of the email verification.
     */
    static async logEmailVerification(options, details) {
        return await UserLogService.builder(options)
            .type('email_verification')
            .content('Email verification event')
            .details(details)
            .save();
    }

    /**
     * Logs an email binding event
     * @param {Object} options - The logging options
     * @param {number} options.appid - Application ID
     * @param {number} options.userId - User ID
     * @param {string} options.ip - IP address
     * @param {string} options.userAgent - User agent string
     * @param {string} options.email - Email address being bound
     * @returns {Promise<Object>} The created log entry
     */
    static async logEmailBind(options) {
        const { email, ...baseOptions } = options;

        return await this.builder(baseOptions)
            .type('bind')
            .content(`Email binding: ${email}`)
            .details({
                bindType: 'email',
                email,
                timestamp: Date.now()
            })
            .save();
    }
}

module.exports = UserLogService; 