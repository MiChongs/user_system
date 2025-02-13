const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const { promisify } = require('util');
const dayjs = require('./dayjs');
const { Worker } = require('worker_threads');
const os = require('os');

/**
 * 文件索引类 - 用于加速文件搜索
 */
class FileIndex {
    constructor() {
        this.index = new Map();
        this.lastUpdate = 0;
        this.updateInterval = 5 * 60 * 1000; // 5分钟更新一次
    }

    /**
     * 更新索引
     * @param {Array<Object>} files 文件列表
     */
    update(files) {
        this.index.clear();
        this.lastUpdate = Date.now();

        for (const file of files) {
            // 索引文件名（不含扩展名）
            const nameWithoutExt = path.basename(file.name, path.extname(file.name)).toLowerCase();
            this.addToIndex('name', nameWithoutExt, file);

            // 索引扩展名
            const ext = path.extname(file.name).toLowerCase();
            if (ext) {
                this.addToIndex('ext', ext.slice(1), file);
            }

            // 索引MIME类型
            this.addToIndex('type', file.mimeType.split('/')[0], file);
            this.addToIndex('type', file.mimeType, file);

            // 索引大小范围
            const sizeRange = this.getSizeRange(file.size);
            this.addToIndex('size', sizeRange, file);

            // 索引修改日期
            const dateKey = dayjs(file.modified).format('YYYY-MM-DD');
            this.addToIndex('date', dateKey, file);
        }
    }

    /**
     * 添加到索引
     * @private
     */
    addToIndex(category, key, file) {
        const categoryMap = this.index.get(category) || new Map();
        const files = categoryMap.get(key) || new Set();
        files.add(file);
        categoryMap.set(key, files);
        this.index.set(category, categoryMap);
    }

    /**
     * 获取文件大小范围
     * @private
     */
    getSizeRange(size) {
        if (size < 1024) return '0-1KB';
        if (size < 1024 * 1024) return '1KB-1MB';
        if (size < 1024 * 1024 * 10) return '1MB-10MB';
        return '10MB+';
    }

    /**
     * 搜索文件
     * @param {Object} criteria 搜索条件
     * @returns {Set<Object>} 搜索结果
     */
    search(criteria) {
        const results = new Set();
        let initialized = false;

        // 按名称搜索
        if (criteria.name) {
            const nameMap = this.index.get('name');
            const matchingFiles = new Set();
            
            // 支持模糊搜索
            const searchTerm = criteria.name.toLowerCase();
            nameMap.forEach((files, key) => {
                if (criteria.exact ? key === searchTerm : key.includes(searchTerm)) {
                    files.forEach(file => matchingFiles.add(file));
                }
            });

            if (!initialized) {
                matchingFiles.forEach(file => results.add(file));
                initialized = true;
            } else {
                this.intersect(results, matchingFiles);
            }
        }

        // 按类型搜索
        if (criteria.type) {
            const typeMap = this.index.get('type');
            const matchingFiles = typeMap.get(criteria.type) || new Set();

            if (!initialized) {
                matchingFiles.forEach(file => results.add(file));
                initialized = true;
            } else {
                this.intersect(results, matchingFiles);
            }
        }

        // 按大小范围搜索
        if (criteria.sizeRange) {
            const sizeMap = this.index.get('size');
            const matchingFiles = sizeMap.get(criteria.sizeRange) || new Set();

            if (!initialized) {
                matchingFiles.forEach(file => results.add(file));
                initialized = true;
            } else {
                this.intersect(results, matchingFiles);
            }
        }

        return results;
    }

    /**
     * 计算两个集合的交集
     * @private
     */
    intersect(setA, setB) {
        for (const item of setA) {
            if (!setB.has(item)) {
                setA.delete(item);
            }
        }
    }
}

/**
 * 文件服务类
 */
class FileService {
    constructor(options = {}) {
        this.baseDir = options.baseDir || path.join(process.cwd(), 'uploads');
        this.allowedTypes = options.allowedTypes || [
            'image/jpeg', 
            'image/png', 
            'image/gif', 
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
            'application/x-rar-compressed',
            'application/x-7z-compressed'
        ];
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 默认10MB
        this.maxBatchSize = options.maxBatchSize || 10; // 最大批处理数量
        
        // 初始化存储目录
        this.initStorage();
        this.fileIndex = new FileIndex();
        this.indexUpdatePromise = null;
    }

    /**
     * 初始化存储目录
     * @private
     */
    async initStorage() {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            
            // 创建子目录
            const subDirs = ['images', 'documents', 'temp'];
            for (const dir of subDirs) {
                await fs.mkdir(path.join(this.baseDir, dir), { recursive: true });
            }
        } catch (error) {
            console.error('Storage initialization failed:', error);
            throw new Error('Failed to initialize storage');
        }
    }

    /**
     * 生成安全的文件名
     * @private
     * @param {string} originalName 原始文件名
     * @returns {string} 安全的文件名
     */
    generateSafeFileName(originalName) {
        const ext = path.extname(originalName);
        const timestamp = dayjs().format('YYYYMMDDHHmmss');
        const random = crypto.randomBytes(8).toString('hex');
        return `${timestamp}-${random}${ext}`;
    }

    /**
     * 获取文件存储路径
     * @private
     * @param {string} fileName 文件名
     * @param {string} type 文件类型
     * @returns {string} 存储路径
     */
    getStoragePath(fileName, type) {
        const date = dayjs().format('YYYY/MM/DD');
        let subDir = 'documents';
        
        if (type.startsWith('image/')) {
            subDir = 'images';
        }
        
        return path.join(this.baseDir, subDir, date);
    }

    /**
     * 验证文件
     * @private
     * @param {Object} file 文件对象
     * @throws {Error} 验证失败时抛出错误
     */
    validateFile(file) {
        if (!file) {
            throw new Error('No file provided');
        }

        if (!this.allowedTypes.includes(file.mimetype)) {
            throw new Error('File type not allowed');
        }

        if (file.size > this.maxFileSize) {
            throw new Error('File size exceeds limit');
        }
    }

    /**
     * 上传文件
     * @param {Object} file 文件对象
     * @param {Object} options 上传选项
     * @returns {Promise<Object>} 上传结果
     */
    async upload(file, options = {}) {
        try {
            this.validateFile(file);
            const fileName = this.generateSafeFileName(file.name);
            const storagePath = this.getStoragePath(fileName, file.mimetype);
            
            await fs.mkdir(storagePath, { recursive: true });
            const filePath = path.join(storagePath, fileName);
            await fs.writeFile(filePath, file.data);

            return {
                success: true,
                fileName,
                path: filePath.replace(this.baseDir, '').replace(/\\/g, '/'),
                size: file.data.length,
                type: file.mimetype,
                url: `/uploads${filePath.replace(this.baseDir, '').replace(/\\/g, '/')}`
            };
        } catch (error) {
            console.error('File upload failed:', error);
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    /**
     * 删除文件
     * @param {string} filePath 文件路径
     * @returns {Promise<boolean>} 是否删除成功
     */
    async delete(filePath) {
        try {
            const fullPath = path.join(this.baseDir, filePath);
            await fs.unlink(fullPath);
            return true;
        } catch (error) {
            console.error('File deletion failed:', error);
            return false;
        }
    }

    /**
     * 获取文件信息
     * @param {string} filePath 文件路径
     * @returns {Promise<Object>} 文件信息
     */
    async getInfo(filePath) {
        try {
            const fullPath = path.join(this.baseDir, filePath);
            const stats = await fs.stat(fullPath);
            
            return {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                type: mime.lookup(fullPath) || 'application/octet-stream',
                url: `/uploads${filePath.replace(/\\/g, '/')}`
            };
        } catch (error) {
            console.error('Failed to get file info:', error);
            throw new Error('File not found');
        }
    }

    /**
     * 移动文件
     * @param {string} source 源路径
     * @param {string} destination 目标路径
     * @returns {Promise<boolean>} 是否移动成功
     */
    async move(source, destination) {
        try {
            const sourcePath = path.join(this.baseDir, source);
            const destPath = path.join(this.baseDir, destination);
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.rename(sourcePath, destPath);
            return true;
        } catch (error) {
            console.error('File move failed:', error);
            return false;
        }
    }

    /**
     * 复制文件
     * @param {string} source 源路径
     * @param {string} destination 目标路径
     * @returns {Promise<boolean>} 是否复制成功
     */
    async copy(source, destination) {
        try {
            const sourcePath = path.join(this.baseDir, source);
            const destPath = path.join(this.baseDir, destination);
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            await fs.copyFile(sourcePath, destPath);
            return true;
        } catch (error) {
            console.error('File copy failed:', error);
            return false;
        }
    }

    /**
     * 检查文件是否存在
     * @param {string} filePath 文件路径
     * @returns {Promise<boolean>} 文件是否存在
     */
    async exists(filePath) {
        try {
            await fs.access(path.join(this.baseDir, filePath));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 创建临时文件
     * @param {Buffer} data 文件数据
     * @param {string} [ext] 文件扩展名
     * @returns {Promise<string>} 临时文件路径
     */
    async createTemp(data, ext = '') {
        const fileName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const filePath = path.join(this.baseDir, 'temp', fileName);
        
        await fs.writeFile(filePath, data);
        
        // 设置24小时后自动删除
        setTimeout(async () => {
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.error('Failed to delete temp file:', error);
            }
        }, 24 * 60 * 60 * 1000);
        
        return path.join('temp', fileName);
    }

    /**
     * 重命名文件
     * @param {string} filePath 文件路径
     * @param {string} newName 新文件名
     * @returns {Promise<Object>} 重命名结果
     */
    async rename(filePath, newName) {
        try {
            const fullPath = path.join(this.baseDir, filePath);
            const dirName = path.dirname(fullPath);
            const ext = path.extname(filePath);
            const newFileName = `${newName}${ext}`;
            const newPath = path.join(dirName, newFileName);

            if (await this.exists(path.relative(this.baseDir, newPath))) {
                throw new Error('File name already exists');
            }

            await fs.rename(fullPath, newPath);

            return {
                success: true,
                oldPath: filePath,
                newPath: path.relative(this.baseDir, newPath).replace(/\\/g, '/'),
                url: `/uploads${path.relative(this.baseDir, newPath).replace(/\\/g, '/')}`
            };
        } catch (error) {
            console.error('File rename failed:', error);
            throw new Error(`Rename failed: ${error.message}`);
        }
    }

    /**
     * 批量上传文件
     * @param {Array<Object>} files 文件对象数组
     * @param {Object} options 上传选项
     * @returns {Promise<Array<Object>>} 上传结果数组
     */
    async batchUpload(files, options = {}) {
        if (!Array.isArray(files)) {
            throw new Error('Files must be an array');
        }

        if (files.length > this.maxBatchSize) {
            throw new Error(`Cannot upload more than ${this.maxBatchSize} files at once`);
        }

        const results = [];
        const errors = [];

        for (const file of files) {
            try {
                const result = await this.upload(file, options);
                results.push(result);
            } catch (error) {
                errors.push({
                    fileName: file.name,
                    error: error.message
                });
            }
        }

        return {
            success: errors.length === 0,
            results,
            errors,
            totalProcessed: files.length,
            successCount: results.length,
            failureCount: errors.length
        };
    }

    /**
     * 批量删除文件
     * @param {Array<string>} filePaths 文件路径数组
     * @returns {Promise<Object>} 删除结果
     */
    async batchDelete(filePaths) {
        if (!Array.isArray(filePaths)) {
            throw new Error('File paths must be an array');
        }

        if (filePaths.length > this.maxBatchSize) {
            throw new Error(`Cannot delete more than ${this.maxBatchSize} files at once`);
        }

        const results = [];
        const errors = [];

        for (const filePath of filePaths) {
            try {
                const success = await this.delete(filePath);
                if (success) {
                    results.push(filePath);
                } else {
                    errors.push({ path: filePath, error: 'Delete failed' });
                }
            } catch (error) {
                errors.push({ path: filePath, error: error.message });
            }
        }

        return {
            success: errors.length === 0,
            deleted: results,
            errors,
            totalProcessed: filePaths.length,
            successCount: results.length,
            failureCount: errors.length
        };
    }

    /**
     * 列出目录内容
     * @param {string} dirPath 目录路径
     * @param {Object} options 选项
     * @returns {Promise<Array>} 文件列表
     */
    async list(dirPath = '', options = {}) {
        const {
            recursive = false,
            filter = () => true,
            sort = 'name', // name, size, date
            order = 'asc' // asc, desc
        } = options;

        const fullPath = path.join(this.baseDir, dirPath);
        const items = [];

        try {
            const processDir = async (currentPath, relativePath = '') => {
                const entries = await fs.readdir(currentPath, { withFileTypes: true });

                for (const entry of entries) {
                    const fullEntryPath = path.join(currentPath, entry.name);
                    const relativeEntryPath = path.join(relativePath, entry.name);

                    if (entry.isDirectory()) {
                        if (recursive) {
                            await processDir(fullEntryPath, relativeEntryPath);
                        } else {
                            items.push({
                                name: entry.name,
                                path: relativeEntryPath.replace(/\\/g, '/'),
                                type: 'directory',
                                size: 0,
                                modified: (await fs.stat(fullEntryPath)).mtime
                            });
                        }
                    } else {
                        const stats = await fs.stat(fullEntryPath);
                        const fileInfo = {
                            name: entry.name,
                            path: relativeEntryPath.replace(/\\/g, '/'),
                            type: 'file',
                            size: stats.size,
                            modified: stats.mtime,
                            mimeType: mime.lookup(entry.name) || 'application/octet-stream',
                            url: `/uploads/${relativeEntryPath.replace(/\\/g, '/')}`
                        };

                        if (filter(fileInfo)) {
                            items.push(fileInfo);
                        }
                    }
                }
            };

            await processDir(fullPath);

            // 排序
            items.sort((a, b) => {
                let compareResult = 0;
                switch (sort) {
                    case 'name':
                        compareResult = a.name.localeCompare(b.name);
                        break;
                    case 'size':
                        compareResult = a.size - b.size;
                        break;
                    case 'date':
                        compareResult = a.modified - b.modified;
                        break;
                }
                return order === 'desc' ? -compareResult : compareResult;
            });

            return items;
        } catch (error) {
            console.error('List directory failed:', error);
            throw new Error(`Failed to list directory: ${error.message}`);
        }
    }

    /**
     * 更新文件索引
     * @private
     */
    async updateIndex() {
        if (this.indexUpdatePromise) {
            return this.indexUpdatePromise;
        }

        this.indexUpdatePromise = (async () => {
            try {
                const files = await this.list('', { recursive: true });
                this.fileIndex.update(files);
            } finally {
                this.indexUpdatePromise = null;
            }
        })();

        return this.indexUpdatePromise;
    }

    /**
     * 高性能文件搜索
     * @param {Object} options 搜索选项
     * @returns {Promise<Array>} 搜索结果
     */
    async findFiles(options = {}) {
        const {
            name,
            type,
            sizeRange,
            modifiedAfter,
            modifiedBefore,
            exact = false,
            limit = 100,
            offset = 0
        } = options;

        // 确保索引是最新的
        if (Date.now() - this.fileIndex.lastUpdate > this.fileIndex.updateInterval) {
            await this.updateIndex();
        }

        // 执行搜索
        const results = Array.from(this.fileIndex.search({
            name,
            type,
            sizeRange,
            exact
        }));

        // 应用日期过滤
        let filteredResults = results;
        if (modifiedAfter || modifiedBefore) {
            filteredResults = results.filter(file => {
                const fileDate = dayjs(file.modified);
                if (modifiedAfter && fileDate.isBefore(modifiedAfter)) return false;
                if (modifiedBefore && fileDate.isAfter(modifiedBefore)) return false;
                return true;
            });
        }

        // 应用分页
        return {
            total: filteredResults.length,
            items: filteredResults.slice(offset, offset + limit),
            hasMore: filteredResults.length > offset + limit
        };
    }

    /**
     * 并发搜索文件
     * @param {Object} options 搜索选项 
     * @returns {Promise<Object>} 搜索结果
     */
    async parallelSearch(options = {}) {
        const {
            name,
            type,
            sizeRange,
            modifiedAfter,
            modifiedBefore,
            exact = false,
            limit = 100,
            offset = 0,
            threads = os.cpus().length // 默认使用CPU核心数
        } = options;

        // 确保索引是最新的
        if (Date.now() - this.fileIndex.lastUpdate > this.fileIndex.updateInterval) {
            await this.updateIndex();
        }

        // 获取所有文件
        const allFiles = Array.from(this.fileIndex.search({
            name,
            type,
            sizeRange,
            exact
        }));

        // 如果文件数量较少,直接使用单线程处理
        if (allFiles.length < 1000) {
            return this.findFiles(options);
        }

        // 将文件分片
        const chunkSize = Math.ceil(allFiles.length / threads);
        const chunks = [];
        for (let i = 0; i < allFiles.length; i += chunkSize) {
            chunks.push(allFiles.slice(i, i + chunkSize));
        }

        try {
            // 创建工作线程
            const workers = chunks.map((chunk, index) => {
                return new Promise((resolve, reject) => {
                    const worker = new Worker(`${__dirname}/searchWorker.js`, {
                        workerData: {
                            files: chunk,
                            criteria: {
                                modifiedAfter,
                                modifiedBefore
                            }
                        }
                    });

                    worker.on('message', resolve);
                    worker.on('error', reject);
                    worker.on('exit', (code) => {
                        if (code !== 0) {
                            reject(new Error(`Worker stopped with exit code ${code}`));
                        }
                    });
                });
            });

            // 等待所有工作线程完成
            const results = await Promise.all(workers);

            // 合并结果
            const filteredResults = results.flat();

            // 排序和分页
            filteredResults.sort((a, b) => {
                return dayjs(b.modified).valueOf() - dayjs(a.modified).valueOf();
            });

            return {
                total: filteredResults.length,
                items: filteredResults.slice(offset, offset + limit),
                hasMore: filteredResults.length > offset + limit
            };

        } catch (error) {
            console.error('Parallel search failed:', error);
            // 如果并行搜索失败,回退到普通搜索
            return this.findFiles(options);
        }
    }
}

// 创建默认实例
const fileService = new FileService();

module.exports = fileService; 