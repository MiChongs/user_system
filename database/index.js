const { Sequelize } = require("sequelize");
const debug = require('debug')('app:database');
const cluster = require('cluster');

/**
 * # Sequelize 数据库配置
 * @type {Sequelize}
 * @return Sequelize
 */

const mysql = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_SERVER,
    dialect: "mysql",
    timezone: '+08:00',
    
    // 连接池配置 - 根据CPU核心数优化
    pool: {
        max: cluster.isPrimary ? 
            Math.min(20, require('os').cpus().length * 5) : // 主进程使用更多连接
            Math.min(10, require('os').cpus().length * 2),  // 工作进程使用较少连接
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        acquire: 20000,
        idle: 5000,
        evict: 1000,
    },
    
    // 重试配置
    retry: {
        max: 5,
        timeout: 3000,
        backoffBase: 1000,
        backoffExponent: 1.5,
        match: [
            /Deadlock/i,
            /Lock wait timeout/i,
            /Too many connections/i,
            /ETIMEDOUT/,
            /ECONNRESET/,
            /PROTOCOL_CONNECTION_LOST/,
            /PROTOCOL_SEQUENCE_TIMEOUT/,
            /ECONNREFUSED/,
            /ER_SERVER_SHUTDOWN/,
            /ER_ACCESS_DENIED_ERROR/
        ]
    },

    // 性能优化
    dialectOptions: {   
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true,
        decimalNumbers: true,
        maxPreparedStatements: 100,
        // 连接参数优化
        typeCast: true,
        multipleStatements: false, // 安全性考虑
        flags: [
            '-FOUND_ROWS',
            '-IGNORE_SPACE',
            '+MULTI_STATEMENTS',
            '+PROTOCOL_41',
            '+PS_MULTI_RESULTS',
            '+TRANSACTION'
        ],
        // 压缩选项
        compress: true,
        // SSL配置
        ssl: process.env.DB_SSL === 'true' ? {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
        } : null
    },

    // 日志配置
    logging: (msg, timing) => {
        if (process.env.NODE_ENV === 'development') {
            debug(msg);
        }
        // 记录慢查询 (超过500ms)
        if (timing && timing > 500) {
            console.warn('[慢查询警告]', {
                query: msg,
                timing: `${timing}ms`,
                time: new Date().toISOString()
            });
        }
    },

    // 查询优化
    define: {
        timestamps: true,
        // 索引优化
        // 字段类型优化
        typeValidation: true
    },
    
    // 性能追踪
    logQueryParameters: process.env.NODE_ENV === 'development',
    
    // 查询缓存
    cache: {
        max: 500,
        ttl: 60000 // 1分钟
    }
});

// 连接健康检查 - 使用指数退避
let healthCheckInterval;
let retryCount = 0;
const MAX_RETRY_COUNT = 5;

const startHealthCheck = () => {
    const checkConnection = async () => {
        try {
            await mysql.authenticate();
            debug('数据库连接正常');
            retryCount = 0; // 重置重试计数
        } catch (error) {
            console.error('[数据库连接异常]', {
                time: new Date().toISOString(),
                error: error.message,
                retryCount
            });
            
            if (retryCount < MAX_RETRY_COUNT) {
                retryCount++;
                const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // 最大30秒
                
                // 尝试重新连接
                setTimeout(async () => {
                    try {
                        await mysql.connectionManager.initPools();
                        console.log('[数据库重连成功]', new Date().toISOString());
                    } catch (reconnectError) {
                        console.error('[数据库重连失败]', {
                            time: new Date().toISOString(),
                            error: reconnectError.message,
                            nextRetryDelay: delay
                        });
                    }
                }, delay);
            } else {
                console.error('[数据库重连次数超限]', {
                    time: new Date().toISOString(),
                    maxRetries: MAX_RETRY_COUNT
                });
                process.exit(1); // 严重错误，退出进程
            }
        }
    };

    healthCheckInterval = setInterval(checkConnection, 
        parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000')
    );
};

// 初始化连接
const initializeDatabase = async () => {
    try {
        // 测试连接
        await mysql.authenticate();
        console.log('[数据库] 连接成功');
        debug('数据库初始化完成');

        // 启动健康检查
        startHealthCheck();

        // 注册进程退出处理
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', async (error) => {
            console.error('[未捕获的异常]', error);
            await cleanup();
        });

        return mysql;
    } catch (error) {
        console.error('[数据库] 连接失败:', {
            time: new Date().toISOString(),
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

// 清理函数
const cleanup = async () => {
    clearInterval(healthCheckInterval);
    try {
        await mysql.close();
        console.log('[数据库] 连接已关闭');
    } catch (error) {
        console.error('[数据库] 关闭连接失败:', {
            time: new Date().toISOString(),
            error: error.message
        });
    }
    process.exit(0);
};

// 导出实例和初始化函数
module.exports = {
    mysql,
    initializeDatabase
};