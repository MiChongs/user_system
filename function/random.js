const RandomService = require('./randomService');

/**
 * 生成指定长度的随机数字
 * @param {number} [length=6] 长度
 * @returns {string} 随机数字字符串
 */
const number = (length = 6) => RandomService.generateNumber(length);

/**
 * 生成指定范围的随机整数
 * @param {number} min 最小值（包含）
 * @param {number} max 最大值（包含）
 * @returns {number} 随机整数
 */
const integer = (min, max) => RandomService.generateInteger(min, max);

/**
 * 生成随机字符串
 * @param {number} [length=8] 长度
 * @param {string} [charset] 字符集
 * @returns {string} 随机字符串
 */
const string = (length = 8, charset) => RandomService.generateString(length, charset);

/**
 * 生成UUID
 * @returns {string} UUID字符串
 */
const uuid = () => RandomService.generateUUID();

/**
 * 生成验证码
 * @param {Object} [options] 选项
 * @param {number} [options.length=6] 长度
 * @param {boolean} [options.letters=false] 是否包含字母
 * @returns {string} 验证码
 */
const code = (options) => RandomService.generateVerificationCode(options);

/**
 * 生成快速（非加密）随机数字
 * @param {number} [length=6] 长度
 * @returns {string} 随机数字字符串
 */
const fastNumber = (length = 6) => RandomService.generateNumber(length, false);

/**
 * 生成快速（非加密）随机整数
 * @param {number} min 最小值（包含）
 * @param {number} max 最大值（包含）
 * @returns {number} 随机整数
 */
const fastInteger = (min, max) => RandomService.generateInteger(min, max, false);

/**
 * 预定义的字符集
 */
const charset = {
    NUMBERS: '0123456789',
    LETTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
    ALPHANUMERIC: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    SAFE: '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', // 排除易混淆字符
    SYMBOLS: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

module.exports = {
    number,
    integer,
    string,
    uuid,
    code,
    fastNumber,
    fastInteger,
    charset,
    // 为了向后兼容和高级用例，仍然导出服务类
    service: RandomService
}; 