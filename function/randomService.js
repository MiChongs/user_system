const crypto = require('crypto');

/**
 * 随机数生成服务类
 */
class RandomService {
    /**
     * 生成指定长度的随机数字字符串
     * @param {number} length 长度
     * @param {boolean} [secure=true] 是否使用加密随机数
     * @returns {string} 随机数字字符串
     */
    static generateNumber(length = 6, secure = true) {
        if (length <= 0) throw new Error('Length must be positive');
        if (length > 1024) throw new Error('Length too large');

        try {
            if (secure) {
                // 使用加密随机数生成器
                return this._generateSecureNumber(length);
            } else {
                // 使用快速随机数生成器
                return this._generateFastNumber(length);
            }
        } catch (error) {
            console.error('Random number generation failed:', error);
            // 降级到备用方法
            return this._generateFallbackNumber(length);
        }
    }

    /**
     * 生成指定范围内的随机整数
     * @param {number} min 最小值（包含）
     * @param {number} max 最大值（包含）
     * @param {boolean} [secure=true] 是否使用加密随机数
     * @returns {number} 随机整数
     */
    static generateInteger(min, max, secure = true) {
        if (min > max) [min, max] = [max, min];
        const range = max - min + 1;

        try {
            if (secure) {
                // 使用加密随机数
                const randomBytes = crypto.randomBytes(4);
                const randomInt = randomBytes.readUInt32BE(0);
                return min + (randomInt % range);
            } else {
                // 使用快速随机数
                return min + Math.floor(Math.random() * range);
            }
        } catch (error) {
            console.error('Random integer generation failed:', error);
            // 降级到备用方法
            return min + Math.floor(Math.random() * range);
        }
    }

    /**
     * 生成随机字符串
     * @param {number} length 长度
     * @param {string} [charset] 字符集
     * @returns {string} 随机字符串
     */
    static generateString(length = 8, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        if (length <= 0) throw new Error('Length must be positive');
        if (length > 1024) throw new Error('Length too large');
        if (!charset || charset.length === 0) throw new Error('Invalid charset');

        try {
            const randomBytes = crypto.randomBytes(length);
            const result = new Array(length);
            const charsetLength = charset.length;

            for (let i = 0; i < length; i++) {
                result[i] = charset[randomBytes[i] % charsetLength];
            }

            return result.join('');
        } catch (error) {
            console.error('Random string generation failed:', error);
            // 降级到备用方法
            return Array(length)
                .fill(0)
                .map(() => charset[Math.floor(Math.random() * charset.length)])
                .join('');
        }
    }

    /**
     * 生成UUID v4
     * @returns {string} UUID字符串
     */
    static generateUUID() {
        try {
            return crypto.randomUUID();
        } catch (error) {
            console.error('UUID generation failed:', error);
            // 降级到备用方法
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    }

    /**
     * 生成安全的随机数字字符串（使用加密随机数）
     * @private
     * @param {number} length 长度
     * @returns {string} 随机数字字符串
     */
    static _generateSecureNumber(length) {
        const randomBytes = crypto.randomBytes(Math.ceil(length * 1.5));
        let result = '';
        
        for (let i = 0; i < randomBytes.length && result.length < length; i++) {
            const digit = randomBytes[i] % 10;
            if (result.length === 0 && digit === 0) continue; // 避免首位为0
            result += digit;
        }

        // 补齐长度（极少数情况）
        while (result.length < length) {
            result += Math.floor(Math.random() * 10);
        }

        return result;
    }

    /**
     * 生成快速的随机数字字符串（非加密）
     * @private
     * @param {number} length 长度
     * @returns {string} 随机数字字符串
     */
    static _generateFastNumber(length) {
        let result = '';
        for (let i = 0; i < length; i++) {
            if (i === 0) {
                // 首位不能为0
                result += Math.floor(Math.random() * 9) + 1;
            } else {
                result += Math.floor(Math.random() * 10);
            }
        }
        return result;
    }

    /**
     * 备用随机数生成方法
     * @private
     * @param {number} length 长度
     * @returns {string} 随机数字字符串
     */
    static _generateFallbackNumber(length) {
        const min = Math.pow(10, length - 1);
        const max = Math.pow(10, length) - 1;
        return Math.floor(min + Math.random() * (max - min + 1)).toString();
    }

    /**
     * 生成随机验证码
     * @param {Object} options 选项
     * @param {number} [options.length=6] 长度
     * @param {boolean} [options.letters=false] 是否包含字母
     * @param {boolean} [options.secure=true] 是否使用加密随机数
     * @returns {string} 验证码
     */
    static generateVerificationCode(options = {}) {
        const {
            length = 6,
            letters = false,
            secure = true
        } = options;

        if (letters) {
            // 生成字母数字混合的验证码
            const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 排除易混淆的字符
            return this.generateString(length, charset);
        } else {
            // 生成纯数字验证码
            return this.generateNumber(length, secure);
        }
    }
}

module.exports = RandomService; 