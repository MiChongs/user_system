const { redisClient } = require("../global");
const dayjs = require("./dayjs");

/**
 * 时间单位枚举
 * @enum {string}
 */
const TimeUnit = {
    SECONDS: 'seconds',
    MINUTES: 'minutes',
    HOURS: 'hours',
    DAYS: 'days',
    WEEKS: 'weeks',
    MONTHS: 'months',
    YEARS: 'years'
};

/**
 * Redis 服务类
 */
class RedisService {
    /**
     * 转换时间单位为秒
     * @private
     * @param {number} value 时间值
     * @param {TimeUnit} unit 时间单位
     * @returns {number} 秒数
     */
    static _convertToSeconds(value, unit) {
        const now = dayjs();
        const future = now.add(value, unit);
        return future.diff(now, 'second');
    }

    /**
     * 设置缓存
     * @param {string} key 缓存键
     * @param {any} value 缓存值
     * @param {number} expireTime 过期时间值
     * @param {TimeUnit} [unit=TimeUnit.SECONDS] 时间单位
     */
    static async set(key, value, expireTime = 300, unit = TimeUnit.SECONDS) {
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            const seconds = this._convertToSeconds(expireTime, unit);
            await redisClient.set(key, stringValue, 'EX', seconds);
        } catch (error) {
            console.error('Redis set error:', error);
        }
    }

    /**
     * 获取缓存
     * @param {string} key 缓存键
     * @param {boolean} parse 是否需要JSON解析
     * @returns {Promise<any>} 缓存值
     */
    static async get(key, parse = true) {
        try {
            const value = await redisClient.get(key);
            if (!value) return null;
            return parse ? JSON.parse(value) : value;
        } catch (error) {
            console.error('Redis get error:', error);
            return null;
        }
    }

    /**
     * 删除缓存
     * @param {string} key 缓存键
     */
    static async del(key) {
        try {
            await redisClient.del(key);
        } catch (error) {
            console.error('Redis del error:', error);
        }
    }

    /**
     * 设置哈希表字段
     * @param {string} key 哈希表键
     * @param {string} field 字段
     * @param {any} value 值
     * @param {number} [expireTime] 过期时间值
     * @param {TimeUnit} [unit=TimeUnit.SECONDS] 时间单位
     */
    static async hset(key, field, value, expireTime, unit = TimeUnit.SECONDS) {
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            await redisClient.hset(key, field, stringValue);
            
            if (expireTime) {
                const seconds = this._convertToSeconds(expireTime, unit);
                await redisClient.expire(key, seconds);
            }
        } catch (error) {
            console.error('Redis hset error:', error);
        }
    }

    /**
     * 获取哈希表字段
     * @param {string} key 哈希表键
     * @param {string} field 字段
     * @param {boolean} parse 是否需要JSON解析
     * @returns {Promise<any>} 字段值
     */
    static async hget(key, field, parse = true) {
        try {
            const value = await redisClient.hget(key, field);
            if (!value) return null;
            return parse ? JSON.parse(value) : value;
        } catch (error) {
            console.error('Redis hget error:', error);
            return null;
        }
    }

    /**
     * 设置带过期时间的哈希表
     * @param {string} key 哈希表键
     * @param {Object} hash 哈希表数据
     * @param {number} expireTime 过期时间值
     * @param {TimeUnit} [unit=TimeUnit.SECONDS] 时间单位
     */
    static async hmsetex(key, hash, expireTime = 300, unit = TimeUnit.SECONDS) {
        try {
            const stringHash = {};
            for (const [field, value] of Object.entries(hash)) {
                stringHash[field] = typeof value === 'string' ? value : JSON.stringify(value);
            }
            await redisClient.hmset(key, stringHash);
            
            const seconds = this._convertToSeconds(expireTime, unit);
            await redisClient.expire(key, seconds);
        } catch (error) {
            console.error('Redis hmsetex error:', error);
        }
    }

    /**
     * 获取键的剩余过期时间
     * @param {string} key 缓存键
     * @param {TimeUnit} [unit=TimeUnit.SECONDS] 返回的时间单位
     * @returns {Promise<number>} 剩余时间
     */
    static async ttl(key, unit = TimeUnit.SECONDS) {
        try {
            const seconds = await redisClient.ttl(key);
            if (seconds < 0) return seconds;
            return Math.ceil(dayjs.duration(seconds, 'seconds').as(unit));
        } catch (error) {
            console.error('Redis ttl error:', error);
            return -1;
        }
    }

    /**
     * 设置键的过期时间
     * @param {string} key 缓存键
     * @param {number} expireTime 过期时间值
     * @param {TimeUnit} [unit=TimeUnit.SECONDS] 时间单位
     */
    static async expire(key, expireTime, unit = TimeUnit.SECONDS) {
        try {
            const seconds = this._convertToSeconds(expireTime, unit);
            await redisClient.expire(key, seconds);
        } catch (error) {
            console.error('Redis expire error:', error);
        }
    }
}

// 导出时间单位枚举
RedisService.TimeUnit = TimeUnit;

module.exports = RedisService; 