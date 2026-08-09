export default {
  batchImageGuide: {
    title: '图片批量生成',
    description: '一次提交多条提示词，任务完成后可统一下载图片结果'
  },
  // Home Page
  home: {
    seo: {
      title: 'AI API 中转与 Claude、GPT、Gemini 多模型统一网关',
      description: 'Sub2API 提供 Claude、GPT、Gemini 等主流模型的统一 AI API 接入，自建官方订阅号池，支持国内直连、智能调度、会话保持、实时监控与按量计费。',
      keywords: 'AI API,AI API 中转,Claude API,GPT API,Gemini API,API 网关,大模型 API,国内直连,Sub2API'
    },
    navigation: '首页导航',
    capabilities: '平台能力',
    viewOnGithub: '在 GitHub 上查看',
    viewDocs: '查看文档',
    docs: '文档',
    switchToLight: '切换到浅色模式',
    switchToDark: '切换到深色模式',
    dashboard: '控制台',
    login: '登录',
    getStarted: '立即开始',
    goToDashboard: '进入控制台',
    // 首页 H1：价值主张（站点名称在导航栏和 hero eyebrow 中展示）
    heroHeadline: '一个密钥，畅用多个 AI 模型',
    heroDescription: '平台自建自营官方订阅号池，一个密钥直连 Claude、GPT、Gemini 等主流模型。国内免代理、智能调度、实时监控，稳定看得见。',
    poolBadge: '自建号池 · 官方正规订阅',
    directBadge: '国内直连 · 免代理',
    stats: {
      selfOperated: '号池自建自营',
      platforms: '主流平台接入',
      monitoring: '全天候健康监测',
      failover: '秒级故障转移'
    },
    tags: {
      subscriptionToApi: '订阅转 API',
      selfHostedPool: '自建号池',
      stickySession: '会话保持',
      realtimeBilling: '按量计费'
    },
    // 自建号池区块
    pool: {
      title: '自建号池，稳定可控',
      subtitle: '所有上游账号均为平台自建自营的官方订阅——非公共拼车、非二手转售。来源可控，质量可靠，用得放心。',
      caption: '号池节点实时在线 · 全部自建自营',
      features: {
        owned: {
          title: '官方订阅 · 自建自营',
          desc: '号池内全部为平台直接注册并维护的官方订阅账号，来源透明，杜绝共享账号与黑卡风险'
        },
        monitor: {
          title: '实时健康监测',
          desc: '7×24 监控每个账号的可用性与配额状态，异常账号秒级熔断下线，请求无感切换'
        },
        schedule: {
          title: '智能调度 · 会话保持',
          desc: '按负载与健康度智能分配请求，同一会话自动路由到相同账号，上下文连续不断档'
        },
        scale: {
          title: '弹性扩容',
          desc: '号池规模随负载动态扩展，高峰期自动补充产能，告别限流与排队'
        }
      }
    },
    // 国内直连区块
    direct: {
      title: '国内直连，免代理即开即用',
      subtitle: '优化线路直连官方服务，无需 VPN、无需镜像。官方客户端与 SDK 填入地址和密钥即可使用，体验与官方一致。',
      features: {
        noProxy: {
          title: '免代理直连',
          desc: '无需 VPN 与镜像站，网络环境零要求，打开官方客户端填入密钥即可直连调用'
        },
        bgp: {
          title: '多线 BGP 优化',
          desc: '电信 / 联通 / 移动三网优化接入，自动选择最优路径，跨网低延迟不绕路'
        },
        clients: {
          title: '全客户端即插即用',
          desc: 'Claude Code、Codex、Gemini CLI、Cursor 等官方工具零改造接入，满血不降智'
        }
      }
    },
    // 快速开始步骤
    steps: {
      title: '三步接入',
      subtitle: '从注册到发起第一个请求，只需几分钟',
      items: {
        key: {
          title: '创建 API 密钥',
          desc: '注册账号，在控制台一键生成专属密钥'
        },
        call: {
          title: '调用统一接口',
          desc: '将密钥填入任意兼容客户端或 SDK，无需改动业务代码'
        },
        route: {
          title: '号池智能调度',
          desc: '请求自动路由至最健康的自建账号，稳定返回结果'
        }
      }
    },
    // 用户痛点区块
    painPoints: {
      title: '你是否也遇到这些问题？',
      items: {
        expensive: {
          title: '订阅费用高',
          desc: '每个 AI 服务都要单独订阅，每月支出越来越多'
        },
        complex: {
          title: '多账号难管理',
          desc: '不同平台的账号、密钥分散各处，管理起来很麻烦'
        },
        unstable: {
          title: '服务不稳定',
          desc: '单一账号容易触发限制，影响正常使用'
        },
        noControl: {
          title: '用量无法控制',
          desc: '不知道钱花在哪了，也无法限制团队成员的使用'
        }
      }
    },
    // 解决方案区块
    solutions: {
      title: '核心能力',
      subtitle: '稳定、可控、透明的 AI 流量控制平面'
    },
    features: {
      unifiedGateway: '一键接入',
      unifiedGatewayDesc: '获取一个 API 密钥，即可调用所有已接入的 AI 模型，无需分别申请。',
      multiAccount: '稳定可靠',
      multiAccountDesc: '智能调度多个上游账号，自动切换和负载均衡，告别频繁报错。',
      balanceQuota: '用多少付多少',
      balanceQuotaDesc: '按实际使用量计费，支持设置配额上限，团队用量一目了然。'
    },
    // 优势对比
    comparison: {
      title: '为什么选择我们？',
      headers: {
        feature: '对比项',
        official: '官方订阅',
        us: '本平台'
      },
      items: {
        pricing: {
          feature: '付费方式',
          official: '固定月费，用不完也付',
          us: '按量付费，用多少付多少'
        },
        models: {
          feature: '模型选择',
          official: '单一服务商',
          us: '多模型随意切换'
        },
        management: {
          feature: '账号管理',
          official: '每个服务单独管理',
          us: '统一密钥，一站管理'
        },
        stability: {
          feature: '服务稳定性',
          official: '单账号易触发限制',
          us: '多账号池，自动切换'
        },
        control: {
          feature: '用量控制',
          official: '无法限制',
          us: '可设配额、查明细'
        }
      }
    },
    providers: {
      title: '已支持的 AI 模型',
      description: '一个 API，多种选择',
      supported: '已支持',
      soon: '即将推出',
      claude: 'Claude',
      gemini: 'Gemini',
      antigravity: 'Antigravity',
      more: '更多'
    },
    // CTA 区块
    cta: {
      title: '准备好开始了吗？',
      description: '注册即可获得免费试用额度，体验一站式 AI 服务',
      button: '免费注册'
    },
    footer: {
      allRightsReserved: '保留所有权利。',
      links: '页脚链接'
    }
  },

  // Key Usage Query Page
  keyUsage: {
    title: 'API Key 用量查询',
    subtitle: '输入您的 API Key 以查看实时消费金额与使用状态',
    placeholder: 'sk-ant-mirror-xxxxxxxxxxxx',
    query: '查询',
    querying: '查询中...',
    privacyNote: '您的 Key 仅在浏览器本地处理，不会被存储',
    dateRange: '统计范围:',
    dateRangeToday: '今日',
    dateRange7d: '7 天',
    dateRange30d: '30 天',
    dateRange90d: '90 天',
    dateRangeCustom: '自定义',
    apply: '应用',
    used: '已使用',
    detailInfo: '详细信息',
    tokenStats: 'Token 统计',
    dailyDetail: '按日明细',
    modelStats: '模型用量统计',
    // Table headers
    date: '日期',
    model: '模型',
    requests: '请求数',
    inputTokens: '输入 Tokens',
    outputTokens: '输出 Tokens',
    cacheCreationTokens: '缓存创建',
    cacheReadTokens: '缓存读取',
    cacheWriteTokens: '缓存写入',
    totalTokens: '总 Tokens',
    cost: '费用',
    // Status
    quotaMode: 'Key 限额模式',
    walletBalance: '钱包余额',
    // Ring card titles
    totalQuota: '总额度',
    limit5h: '5 小时限额',
    limitDaily: '日限额',
    limit7d: '7 天限额',
    limitWeekly: '周限额',
    limitMonthly: '月限额',
    // Detail rows
    remainingQuota: '剩余额度',
    expiresAt: '过期时间',
    todayExpires: '(今日到期)',
    daysLeft: '({days} 天)',
    usedQuota: '已用额度',
    resetNow: '即将重置',
    subscriptionType: '订阅类型',
    billingType: '计费方式',
    subscriptionExpires: '订阅到期',
    // Usage stat cells
    todayRequests: '今日请求',
    todayInputTokens: '今日输入',
    todayOutputTokens: '今日输出',
    todayTokens: '今日 Tokens',
    todayCacheCreation: '今日缓存创建',
    todayCacheRead: '今日缓存读取',
    todayCost: '今日费用',
    rpmTpm: 'RPM / TPM',
    totalRequests: '累计请求',
    totalInputTokens: '累计输入',
    totalOutputTokens: '累计输出',
    totalTokensLabel: '累计 Tokens',
    totalCacheCreation: '累计缓存创建',
    totalCacheRead: '累计缓存读取',
    totalCost: '累计费用',
    avgDuration: '平均耗时',
    // Messages
    enterApiKey: '请输入 API Key',
    querySuccess: '查询成功',
    queryFailed: '查询失败',
    queryFailedRetry: '查询失败，请稍后重试',
    noDailyUsage: '暂无按日用量数据',
  },

  // Setup Wizard
  setup: {
    title: 'Sub2API 安装向导',
    description: '配置您的 Sub2API 实例',
    database: {
      title: '数据库配置',
      description: '连接到您的 PostgreSQL 数据库',
      host: '主机',
      port: '端口',
      username: '用户名',
      password: '密码',
      databaseName: '数据库名称',
      sslMode: 'SSL 模式',
      passwordPlaceholder: '密码',
      ssl: {
        disable: '禁用',
        require: '要求',
        verifyCa: '验证 CA',
        verifyFull: '完全验证'
      }
    },
    redis: {
      title: 'Redis 配置',
      description: '连接到您的 Redis 服务器',
      host: '主机',
      port: '端口',
      username: '用户名（可选）',
      password: '密码（可选）',
      database: '数据库',
      usernamePlaceholder: '默认用户留空',
      passwordPlaceholder: '密码',
      enableTls: '启用 TLS',
      enableTlsHint: '连接 Redis 时使用 TLS（公共 CA 证书）'
    },
    admin: {
      title: '管理员账户',
      description: '创建您的管理员账户',
      email: '邮箱',
      password: '密码',
      confirmPassword: '确认密码',
      passwordPlaceholder: '至少 8 个字符',
      confirmPasswordPlaceholder: '确认密码',
      passwordMismatch: '密码不匹配'
    },
    ready: {
      title: '准备安装',
      description: '检查您的配置并完成安装',
      database: '数据库',
      redis: 'Redis',
      adminEmail: '管理员邮箱'
    },
    status: {
      testing: '测试中...',
      success: '连接成功',
      testConnection: '测试连接',
      installing: '安装中...',
      completeInstallation: '完成安装',
      completed: '安装完成！',
      redirecting: '正在跳转到登录页面...',
      restarting: '服务正在重启，请稍候...',
      timeout: '服务重启时间超出预期，请手动刷新页面。'
    }
  },

  // Common
}
