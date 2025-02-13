const { parentPort, workerData } = require('worker_threads');
const { User } = require('../models/user');
const { Op } = require('sequelize');
const dayjs = require('../function/dayjs');
const SystemLogService = require('../function/systemLogService');

async function processUsers(data) {
    const { startOffset, batchSize, gracePeriod } = data;
    let frozenCount = 0;

    try {
        const users = await User.findAll({
            where: {
                [Op.or]: [
                    { account: null },
                    { account: '' },
                    { password: null },
                    { password: '' }
                ],
                register_time: {
                    [Op.lt]: dayjs().subtract(gracePeriod, 'days').toDate()
                },
                enabled: true
            },
            limit: batchSize,
            offset: startOffset
        });

        for (const user of users) {
            try {
                user.enabled = false;
                user.reason = '长期未完善账号信息,系统自动冻结';
                await user.save();
                frozenCount++;
            } catch (error) {
                await SystemLogService.error(
                    `临时用户冻结失败: ${user.id}`,
                    { error: error.message }
                );
            }
        }

        parentPort.postMessage({
            success: true,
            processedCount: users.length,
            frozenCount
        });
    } catch (error) {
        parentPort.postMessage({
            success: false,
            error: error.message
        });
    }
}

parentPort.on('message', processUsers); 