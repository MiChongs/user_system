# 管理员仪表盘 API 文档

## 基础信息

- 基础路径: `/admin`
- 认证方式: JWT Token (在请求头中添加 `Authorization: Bearer <token>`)
- 响应格式: JSON
- 缓存时间: 5分钟（使用 Redis）

## 接口列表

### 1. 获取综合仪表盘信息

获取完整的系统状态、资源使用情况和应用统计信息。

```http
GET /admin/dashboard
```

#### 请求头

| 参数名        | 必填  | 说明                           |
|--------------|-------|--------------------------------|
| Authorization| 是    | Bearer Token，例如：Bearer xxx  |

#### 响应示例

```json
{
    "code": 200,
    "data": {
        "systemInfo": {
            "cpu": {
                "manufacturer": "Intel",
                "brand": "Core i7",
                "model": "Intel(R) Core(TM) i7-10700K",
                "cores": {
                    "physical": 8,
                    "logical": 16
                },
                "speed": {
                    "base": "3.80 GHz",
                    "max": "5.10 GHz",
                    "min": "800 MHz"
                },
                "load": [2.34, 2.12, 2.01],
                "temperature": 45.5
            },
            "memory": {
                "total": "32.00 GB",
                "free": "16.50 GB",
                "used": "15.50 GB",
                "active": "12.30 GB",
                "available": "18.70 GB",
                "usage": "41.56%",
                "swapUsed": "2.50 GB",
                "swapTotal": "8.00 GB"
            },
            "disk": [
                {
                    "fs": "NTFS",
                    "type": "SSD",
                    "size": "512.00 GB",
                    "used": "256.00 GB",
                    "available": "256.00 GB",
                    "mount": "C:",
                    "usage": "50.00%"
                }
            ],
            "network": {
                "interfaces": [
                    {
                        "iface": "eth0",
                        "ip4": "192.168.1.100",
                        "ip6": "fe80::1234:5678:9abc:def0",
                        "mac": "00:11:22:33:44:55",
                        "speed": 1000,
                        "type": "wired",
                        "operstate": "up"
                    }
                ],
                "stats": [
                    {
                        "interface": "eth0",
                        "rx_bytes": 1024000,
                        "tx_bytes": 512000,
                        "rx_sec": "1.25 MB/s",
                        "tx_sec": "0.75 MB/s",
                        "ms": 1500
                    }
                ]
            },
            "system": {
                "platform": "win32",
                "type": "Windows_NT",
                "release": "10.0.19045",
                "arch": "x64",
                "hostname": "DESKTOP-XXXXX",
                "uptime": "120 hours"
            },
            "process": {
                "pid": 12345,
                "uptime": "48 hours",
                "memory": {
                    "heapTotal": "150.25 MB",
                    "heapUsed": "125.75 MB",
                    "external": "35.50 MB",
                    "rss": "200.30 MB"
                },
                "nodeVersion": "v16.14.0"
            }
        },
        "adminInfo": {
            "account": "admin",
            "createTime": "2023-12-01T08:00:00.000Z"
        },
        "applicationStats": {
            "totalApps": 5,
            "totalUsers": 1000,
            "onlineUsers": 150,
            "appsDetail": [
                {
                    "appId": 1,
                    "appName": "测试应用1",
                    "userCount": 300,
                    "onlineCount": 50
                }
            ]
        }
    }
}
```

## 数据字段说明

### CPU 信息
- `manufacturer`: CPU 制造商
- `brand`: CPU 品牌
- `model`: CPU 型号
- `cores`: 
  - `physical`: 物理核心数
  - `logical`: 逻辑核心数（线程数）
- `speed`: 
  - `base`: 基础频率
  - `max`: 最大睿频
  - `min`: 最小频率
- `load`: 1、5、15分钟的平均负载
- `temperature`: CPU温度（摄氏度）

### 内存信息
- `total`: 总物理内存
- `free`: 空闲内存
- `used`: 已使用内存
- `active`: 活跃使用的内存
- `available`: 可用内存（包括可回收的缓存）
- `usage`: 内存使用率百分比
- `swapUsed`: 已使用的交换内存
- `swapTotal`: 总交换内存

### 磁盘信息
- `fs`: 文件系统类型
- `type`: 存储设备类型（SSD/HDD）
- `size`: 总容量
- `used`: 已使用空间
- `available`: 可用空间
- `mount`: 挂载点
- `usage`: 使用率百分比

### 网络信息
- `interfaces`: 网络接口列表
  - `iface`: 接口名称
  - `ip4`: IPv4 地址
  - `ip6`: IPv6 地址
  - `mac`: MAC 地址
  - `speed`: 连接速度（Mbps）
  - `type`: 连接类型
  - `operstate`: 操作状态
- `stats`: 网络统计
  - `rx_bytes`: 接收的总字节数
  - `tx_bytes`: 发送的总字节数
  - `rx_sec`: 每秒接收速率
  - `tx_sec`: 每秒发送速率
  - `ms`: 统计时间间隔

### 系统信息
- `platform`: 操作系统平台
- `type`: 操作系统类型
- `release`: 系统版本
- `arch`: 系统架构
- `hostname`: 主机名
- `uptime`: 系统运行时间

### 进程信息
- `pid`: 进程ID
- `uptime`: 进程运行时间
- `memory`: 进程内存使用
  - `heapTotal`: 总堆内存
  - `heapUsed`: 已用堆内存
  - `external`: 外部内存
  - `rss`: 常驻内存集
- `nodeVersion`: Node.js 版本

## 注意事项

1. 所有内存和磁盘容量均使用 GB 为单位
2. 网络速率使用 MB/s 为单位
3. CPU 温度信息可能在某些系统上不可用
4. 某些系统信息的可用性取决于操作系统权限和硬件支持
5. 数据会被缓存 5 分钟以减少系统负载
6. 建议在生产环境中适当调整缓存时间

## 错误响应

```json
{
    "code": 500,
    "message": "获取仪表盘信息失败",
    "error": "详细错误信息（仅在开发环境显示）"
}
```

### 常见错误码

| 错误码 | 说明                 |
|--------|---------------------|
| 401    | 未认证或Token无效    |
| 403    | 没有权限            |
| 500    | 服务器内部错误      |

## 性能考虑

1. 使用 Promise.all 并行获取系统信息
2. Redis 缓存减少重复请求
3. 避免频繁刷新，建议客户端至少间隔 5 秒以上再次请求
4. 某些系统信息获取可能较慢，请设置合适的请求超时时间
