export default {
  batchImageGuide: {
    title: 'Batch Image Generation',
    description: 'Submit multiple prompts in one job and download the generated images when complete'
  },
  // Home Page
  home: {
    seo: {
      title: 'Unified AI API Gateway for Claude, GPT and Gemini',
      description: 'Sub2API provides one API key for Claude, GPT, Gemini and other leading AI models through a self-operated account pool with smart routing, sticky sessions and live health monitoring.',
      keywords: 'AI API,AI API gateway,Claude API,GPT API,Gemini API,LLM API,Sub2API'
    },
    navigation: 'Home navigation',
    capabilities: 'Platform capabilities',
    viewOnGithub: 'View on GitHub',
    viewDocs: 'View Documentation',
    docs: 'Docs',
    switchToLight: 'Switch to Light Mode',
    switchToDark: 'Switch to Dark Mode',
    dashboard: 'Dashboard',
    login: 'Login',
    getStarted: 'Get Started',
    goToDashboard: 'Go to Dashboard',
    // Homepage H1: the value proposition (the site name lives in the nav + hero eyebrow)
    heroHeadline: 'One Key, All AI Models',
    heroDescription: 'A self-hosted pool of official subscription accounts, operated by us end to end. One API key connects you directly to Claude, GPT, Gemini and more — no proxy required, with smart routing and live health monitoring.',
    poolBadge: 'Self-Hosted Pool · Official Subscriptions',
    directBadge: 'Direct Connect · No Proxy',
    stats: {
      selfOperated: 'Self-Operated Pool',
      platforms: 'Platforms Connected',
      monitoring: 'Health Monitoring',
      failover: 'Auto Failover'
    },
    tags: {
      subscriptionToApi: 'Subscription to API',
      selfHostedPool: 'Self-Hosted Pool',
      stickySession: 'Session Persistence',
      realtimeBilling: 'Pay As You Go'
    },
    // Self-hosted pool section
    pool: {
      title: 'A Pool We Build and Run Ourselves',
      subtitle: 'Every upstream account is an official subscription registered and operated by our platform — no shared rides, no resold seats. Fully controlled sourcing you can rely on.',
      caption: 'Pool nodes live · all self-operated',
      features: {
        owned: {
          title: 'Official & Self-Operated',
          desc: 'Every account in the pool is an official subscription we registered and maintain ourselves — transparent sourcing, zero shared-account risk'
        },
        monitor: {
          title: 'Real-Time Health Checks',
          desc: '24/7 monitoring of availability and quota for every account; unhealthy nodes are fenced off in seconds with zero impact on your requests'
        },
        schedule: {
          title: 'Smart Routing & Sticky Sessions',
          desc: 'Requests are balanced by load and health, and each session sticks to the same account so context never breaks'
        },
        scale: {
          title: 'Elastic Capacity',
          desc: 'The pool scales with demand — capacity is added automatically at peak, so no rate-limit queues'
        }
      }
    },
    // Direct connect section
    direct: {
      title: 'Direct Connect, Zero Proxy Needed',
      subtitle: 'Optimized routes straight to official model providers — no VPN, no mirrors. Point your official client or SDK at our endpoint and it just works.',
      features: {
        noProxy: {
          title: 'No Proxy Required',
          desc: 'No VPN, no mirror sites, no network setup — drop your key into any official client and start calling'
        },
        bgp: {
          title: 'Multi-Line BGP Routes',
          desc: 'Optimized peering across all major carriers with automatic best-path selection for low, stable latency'
        },
        clients: {
          title: 'Plug-and-Play Clients',
          desc: 'Claude Code, Codex, Gemini CLI, Cursor and more work out of the box — full official-grade model quality'
        }
      }
    },
    // Quick start steps
    steps: {
      title: 'Live in Three Steps',
      subtitle: 'From sign-up to your first request in minutes',
      items: {
        key: {
          title: 'Create an API Key',
          desc: 'Sign up and generate your key from the dashboard in one click'
        },
        call: {
          title: 'Call the Unified API',
          desc: 'Drop the key into any compatible client or SDK — no code changes needed'
        },
        route: {
          title: 'Pool Routes It',
          desc: 'Requests are automatically routed to the healthiest self-operated account'
        }
      }
    },
    // Pain points section
    painPoints: {
      title: 'Sound Familiar?',
      items: {
        expensive: {
          title: 'High Subscription Costs',
          desc: 'Paying for multiple AI subscriptions that add up every month'
        },
        complex: {
          title: 'Account Chaos',
          desc: 'Managing scattered accounts and API keys across different platforms'
        },
        unstable: {
          title: 'Service Interruptions',
          desc: 'Single accounts hitting rate limits and disrupting your workflow'
        },
        noControl: {
          title: 'No Usage Control',
          desc: "Can't track where your money goes or limit team member usage"
        }
      }
    },
    // Solutions section
    solutions: {
      title: 'Core Capabilities',
      subtitle: 'A stable, controllable and transparent control plane for AI traffic'
    },
    features: {
      unifiedGateway: 'One-Click Access',
      unifiedGatewayDesc: 'Get a single API key to call all connected AI models. No separate applications needed.',
      multiAccount: 'Always Reliable',
      multiAccountDesc: 'Smart routing across multiple upstream accounts with automatic failover. Say goodbye to errors.',
      balanceQuota: 'Pay What You Use',
      balanceQuotaDesc: 'Usage-based billing with quota limits. Full visibility into team consumption.'
    },
    // Comparison section
    comparison: {
      title: 'Why Choose Us?',
      headers: {
        feature: 'Comparison',
        official: 'Official Subscriptions',
        us: 'Our Platform'
      },
      items: {
        pricing: {
          feature: 'Pricing',
          official: 'Fixed monthly fee, pay even if unused',
          us: 'Pay only for what you use'
        },
        models: {
          feature: 'Model Selection',
          official: 'Single provider only',
          us: 'Switch between models freely'
        },
        management: {
          feature: 'Account Management',
          official: 'Manage each service separately',
          us: 'Unified key, one dashboard'
        },
        stability: {
          feature: 'Stability',
          official: 'Single account rate limits',
          us: 'Multi-account pool, auto-failover'
        },
        control: {
          feature: 'Usage Control',
          official: 'Not available',
          us: 'Quotas & detailed analytics'
        }
      }
    },
    // Usage modes
    modes: {
      title: 'Two ways to use it, pick what fits',
      subtitle: 'Subscription amortizes upstream costs; API billing is pure pay-as-you-go — same high-availability backend, two pricing shapes.',
      viewPrice: 'Model pricing',
      subscription: {
        kicker: 'SUBSCRIPTION MODE',
        title: 'Subscription · amortize upstream cost',
        lede: 'For stable workloads and teams: spread a high-quality upstream account\'s fixed cost across a daily / weekly / monthly plan — the more you use, the cheaper it gets.',
        p1: {
          tag: 'COST SHARING',
          title: 'Spread fixed upstream cost',
          desc: 'Distribute the upstream account cost across daily, weekly, or monthly plans — keep upstream quality, lower the entry barrier.'
        },
        p2: {
          tag: 'BUDGET FRIENDLY',
          title: 'Capped monthly fee, predictable spend',
          desc: 'Unlimited calls within the plan; monthly billing means no per-spike charges.'
        },
        p3: {
          tag: 'TEAM READY',
          title: 'Share with one click',
          desc: 'Hand out sub-keys to teammates with per-role limits and usage tiers — no signups required.'
        }
      },
      api: {
        kicker: 'API BILLING MODE',
        title: 'API billing · pure pay-as-you-go',
        lede: 'For quick validation, lightweight scripts, and trials: grab a key, get it working, then pay only for the tokens you actually use.',
        p1: {
          tag: 'PAY AS YOU GO',
          title: 'Per-token, real-time billing',
          desc: 'Settle after each call, down to the token; keep calling as long as there\'s balance, no minimum spend.'
        },
        p2: {
          tag: 'INSTANT ACTIVATION',
          title: 'Top up and go',
          desc: 'Get a working key the moment you top up — skip the subscription queue and start validating ideas faster.'
        },
        p3: {
          tag: 'TRANSPARENT USAGE',
          title: 'Clear usage, anytime',
          desc: 'A live dashboard shows tokens and cost for every call — budgets and flow at a glance.'
        }
      }
    },
    providers: {
      title: 'Supported AI Models',
      description: 'One API, Multiple Choices',
      supported: 'Supported',
      soon: 'Soon',
      claude: 'Claude',
      gemini: 'Gemini',
      antigravity: 'Antigravity',
      more: 'More'
    },
    // CTA section
    cta: {
      title: 'Ready to Get Started?',
      description: 'Sign up now and get free trial credits to experience seamless AI access',
      button: 'Sign Up Free'
    },
    footer: {
      allRightsReserved: 'All rights reserved.',
      links: 'Footer links'
    }
  },

  // Key Usage Query Page
  keyUsage: {
    title: 'API Key Usage',
    subtitle: 'Enter your API Key to view real-time spending and usage status',
    placeholder: 'sk-ant-mirror-xxxxxxxxxxxx',
    query: 'Query',
    querying: 'Querying...',
    privacyNote: 'Your Key is processed locally in the browser and will not be stored',
    dateRange: 'Date Range:',
    dateRangeToday: 'Today',
    dateRange7d: '7 Days',
    dateRange30d: '30 Days',
    dateRange90d: '90 Days',
    dateRangeCustom: 'Custom',
    apply: 'Apply',
    used: 'Used',
    detailInfo: 'Detail Information',
    tokenStats: 'Token Statistics',
    dailyDetail: 'Daily Detail',
    modelStats: 'Model Usage Statistics',
    // Table headers
    date: 'Date',
    model: 'Model',
    requests: 'Requests',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    cacheCreationTokens: 'Cache Creation',
    cacheReadTokens: 'Cache Read',
    cacheWriteTokens: 'Cache Write',
    totalTokens: 'Total Tokens',
    cost: 'Cost',
    // Status
    quotaMode: 'Key Quota Mode',
    walletBalance: 'Wallet Balance',
    // Ring card titles
    totalQuota: 'Total Quota',
    limit5h: '5-Hour Limit',
    limitDaily: 'Daily Limit',
    limit7d: '7-Day Limit',
    limitWeekly: 'Weekly Limit',
    limitMonthly: 'Monthly Limit',
    // Detail rows
    remainingQuota: 'Remaining Quota',
    expiresAt: 'Expires At',
    todayExpires: '(expires today)',
    daysLeft: '({days} days)',
    usedQuota: 'Used Quota',
    resetNow: 'Resetting soon',
    subscriptionType: 'Subscription Type',
    billingType: 'Billing Type',
    subscriptionExpires: 'Subscription Expires',
    // Usage stat cells
    todayRequests: 'Today Requests',
    todayInputTokens: 'Today Input',
    todayOutputTokens: 'Today Output',
    todayTokens: 'Today Tokens',
    todayCacheCreation: 'Today Cache Creation',
    todayCacheRead: 'Today Cache Read',
    todayCost: 'Today Cost',
    rpmTpm: 'RPM / TPM',
    totalRequests: 'Total Requests',
    totalInputTokens: 'Total Input',
    totalOutputTokens: 'Total Output',
    totalTokensLabel: 'Total Tokens',
    totalCacheCreation: 'Total Cache Creation',
    totalCacheRead: 'Total Cache Read',
    totalCost: 'Total Cost',
    avgDuration: 'Avg Duration',
    // Messages
    enterApiKey: 'Please enter an API Key',
    querySuccess: 'Query successful',
    queryFailed: 'Query failed',
    queryFailedRetry: 'Query failed, please try again later',
    noDailyUsage: 'No daily usage data',
  },

  // Setup Wizard
  setup: {
    title: 'Sub2API Setup',
    description: 'Configure your Sub2API instance',
    database: {
      title: 'Database Configuration',
      description: 'Connect to your PostgreSQL database',
      host: 'Host',
      port: 'Port',
      username: 'Username',
      password: 'Password',
      databaseName: 'Database Name',
      sslMode: 'SSL Mode',
      passwordPlaceholder: 'Password',
      ssl: {
        disable: 'Disable',
        require: 'Require',
        verifyCa: 'Verify CA',
        verifyFull: 'Verify Full'
      }
    },
    redis: {
      title: 'Redis Configuration',
      description: 'Connect to your Redis server',
      host: 'Host',
      port: 'Port',
      username: 'Username (optional)',
      password: 'Password (optional)',
      database: 'Database',
      usernamePlaceholder: 'Leave empty for default user',
      passwordPlaceholder: 'Password',
      enableTls: 'Enable TLS',
      enableTlsHint: 'Use TLS when connecting to Redis (public CA certs)'
    },
    admin: {
      title: 'Admin Account',
      description: 'Create your administrator account',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      passwordPlaceholder: 'Min 8 characters',
      confirmPasswordPlaceholder: 'Confirm password',
      passwordMismatch: 'Passwords do not match'
    },
    ready: {
      title: 'Ready to Install',
      description: 'Review your configuration and complete setup',
      database: 'Database',
      redis: 'Redis',
      adminEmail: 'Admin Email'
    },
    status: {
      testing: 'Testing...',
      success: 'Connection Successful',
      testConnection: 'Test Connection',
      installing: 'Installing...',
      completeInstallation: 'Complete Installation',
      completed: 'Installation completed!',
      redirecting: 'Redirecting to login page...',
      restarting: 'Service is restarting, please wait...',
      timeout: 'Service restart is taking longer than expected. Please refresh the page manually.'
    }
  },

  // Common
}
