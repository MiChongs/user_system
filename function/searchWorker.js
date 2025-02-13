const { parentPort, workerData } = require('worker_threads');
const dayjs = require('dayjs');

// 接收主线程传来的数据
const { files, criteria } = workerData;
const { modifiedAfter, modifiedBefore } = criteria;

// 在工作线程中处理文件过滤
const filteredFiles = files.filter(file => {
    const fileDate = dayjs(file.modified);
    if (modifiedAfter && fileDate.isBefore(modifiedAfter)) return false;
    if (modifiedBefore && fileDate.isAfter(modifiedBefore)) return false;
    return true;
});

// 将结果发送回主线程
parentPort.postMessage(filteredFiles); 