const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 5000;



// --- CORS Middleware (env-driven allowlist) ---
const allowed = (process.env.CORS_ORIGINS || 'http://localhost:5173,https://release-peace.vercel.app')
  .split(',').map(s => s.trim());

const corsConfig = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    cb(null, allowed.includes(origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With','X-Company-Id'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsConfig));
app.options('*', cors(corsConfig)); // ✅ use same config


// Mount routers safely (use going forward)
function safeUse(path, loader) {
  try { app.use(path, loader()); console.log(`✅ Mounted ${path}`); }
  catch (e) { console.error(`❌ Failed to mount ${path}:`, e.message); }
}

// Trust Railway's proxy
app.set('trust proxy', 1);

console.log('🚀 Starting ReleasePeace API...');
console.log('📍 Port:', PORT);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Initialize cache for flag evaluations
const flagCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });


// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: {
    error: 'Too many requests',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Auth sanity check endpoint
const { authMiddleware } = require('./middleware/auth');
app.get('/api/whoami', authMiddleware, (req, res) => {
  res.json({ ok: true, user: { id: req.user.id, username: req.user.username, email: req.user.email } });
});

// Initialize database connection
let dbConnected = false;
let User, Company, UserCompany, FeatureFlag, FlagState;

async function initDatabase() {
  try {
    console.log('📦 Initializing database...');
    
    const models = require('./models');
    const { sequelize } = models;
    User = models.User;
    Company = models.Company;
    UserCompany = models.UserCompany;
    FeatureFlag = models.FeatureFlag;
    FlagState = models.FlagState;
    
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync models
    await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
    console.log('✅ Database models synchronized');
    
    dbConnected = true;
    
  } catch (dbError) {
    console.error('❌ Database connection failed:', dbError.message);
    dbConnected = false;
  }
}

// ========== BASIC ROUTES ==========

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ReleasePeace Feature Flag API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: dbConnected ? 'connected' : 'disconnected'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'ReleasePeace API',
    version: '1.0.0',
    status: 'online',
    database: dbConnected ? 'connected' : 'disconnected',
    endpoints: {
      health: '/health',
      login: '/api/users/login',
      users: '/api/users',
      companies: '/api/companies',
      flags: '/api/flags',
      sdk: '/sdk'
    }
  });
});

// ========== USER ROUTES ==========

app.post('/api/users/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body);
    
    const { username, role = 'pm', company_id } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    let user;
    let companies = [];

    if (dbConnected) {
      // Try database operations
      try {
        // Find or create user
        user = await User.findOne({ where: { username } });
        
        if (!user) {
          console.log('👤 Creating new user:', username);
          user = await User.create({
            username,
            email: `${username}@demo.com`,
            display_name: username,
            role: role
          });
        }

        // Get user's companies
        const userCompanies = await UserCompany.findAll({
          where: { user_id: user.id, status: 'active' },
          include: [{
            model: Company,
            as: 'company',
            where: { is_active: true },
            required: false
          }]
        });

        companies = userCompanies
          .filter(uc => uc.company)
          .map(uc => ({
            id: uc.company.id,
            name: uc.company.name,
            subdomain: uc.company.subdomain,
            role: uc.role
          }));

      } catch (dbErr) {
        console.error('Database operation failed, using mock data:', dbErr.message);
        // Fall back to mock data
        user = {
          id: `user_${username}`,
          username: username,
          display_name: username,
          role: role,
          email: `${username}@demo.com`
        };
        companies = [{
          id: 'company_demo',
          name: 'Demo Company',
          subdomain: 'demo',
          role: 'owner'
        }];
      }
    } else {
      // Database not connected - use mock data
      user = {
        id: `user_${username}`,
        username: username,
        display_name: username,
        role: role,
        email: `${username}@demo.com`
      };
      companies = [{
        id: 'company_demo',
        name: 'Demo Company',
        subdomain: 'demo',
        role: 'owner'
      }];
    }

    // Generate JWT token (or mock token)
    const jwt = require('jsonwebtoken');
    const tokenPayload = { 
      userId: user.id, 
      username: user.username
    };

    let selectedCompany = null;
    if (company_id) {
      selectedCompany = companies.find(c => c.id === company_id);
      if (selectedCompany) {
        tokenPayload.company_id = selectedCompany.id;
      }
    }

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'demo_secret_key_change_this',
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful for:', username);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name || user.username,
        role: user.role,
        email: user.email
      },
      companies,
      selected_company: selectedCompany
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    });
  }
});

app.get('/api/users', (req, res) => {
  res.json({
    success: true,
    message: 'Users endpoint working',
    endpoints: {
      login: 'POST /api/users/login',
      me: 'GET /api/users/me'
    },
    timestamp: new Date().toISOString()
  });
});

// ---------- ROUTERS (mount once) ----------
app.use('/api/flags', require('./routes/flags'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api', require('./routes/members'));

// ---------- MOCKS (only if explicitly enabled) ----------
if (process.env.MOCK_API === '1') {
  app.get('/api/flags', (req, res) => {
    res.json({
      success: true,
      flags: [
        {
          id: 'flag_demo_1',
          name: 'demo_feature_1',
          description: 'Demo feature flag for testing',
          flag_type: 'rollout',
          risk_level: 'low',
          tags: ['demo', 'test'],
          created_by: 'demo_user',
          creator: { username: 'demo_user', display_name: 'Demo User' },
          states: [
            { environment: 'development', is_enabled: true, rollout_percentage: 100 },
            { environment: 'staging', is_enabled: true, rollout_percentage: 50 },
            { environment: 'production', is_enabled: false, rollout_percentage: 0 }
          ]
        },
        {
          id: 'flag_demo_2',
          name: 'demo_feature_2',
          description: 'Another demo feature flag',
          flag_type: 'experiment',
          risk_level: 'medium',
          tags: ['demo', 'experiment'],
          created_by: 'demo_user',
          creator: { username: 'demo_user', display_name: 'Demo User' },
          states: [
            { environment: 'development', is_enabled: true, rollout_percentage: 100 },
            { environment: 'staging', is_enabled: false, rollout_percentage: 0 },
            { environment: 'production', is_enabled: false, rollout_percentage: 0 }
          ]
        }
      ],
      total: 2,
      message: 'Mock flags data',
      company_id: 'demo_company'
    });
  });

  app.post('/api/flags', (req, res) => {
    const { name, description, flag_type, risk_level, tags } = req.body;
    res.json({
      success: true,
      flag: {
        id: `flag_${Date.now()}`,
        name: name || 'new_flag',
        description: description || 'New feature flag',
        flag_type: flag_type || 'rollout',
        risk_level: risk_level || 'medium',
        tags: tags || [],
        created_by: 'current_user',
        creator: { username: 'current_user', display_name: 'Current User' },
        states: [
          { environment: 'development', is_enabled: false, rollout_percentage: 0 },
          { environment: 'staging', is_enabled: false, rollout_percentage: 0 },
          { environment: 'production', is_enabled: false, rollout_percentage: 0 }
        ]
      },
      message: 'Mock flag creation'
    });
  });

  app.put('/api/flags/:id/state/:environment', (req, res) => {
    const { id, environment } = req.params;
    const { is_enabled, rollout_percentage } = req.body;
    res.json({
      success: true,
      flag_state: {
        flag_id: id,
        environment: environment,
        is_enabled: is_enabled !== undefined ? is_enabled : false,
        rollout_percentage: rollout_percentage || 0,
        updated_by: 'current_user'
      },
      message: 'Mock flag state update'
    });
  });
}

// ========== SDK ROUTES ==========

app.get('/sdk', (req, res) => {
  res.json({
    service: 'ReleasePeace SDK API',
    version: '1.0.0',
    endpoints: {
      evaluate: 'POST /sdk/evaluate/:flagName',
      bulk_evaluate: 'POST /sdk/evaluate-bulk',
      track: 'POST /sdk/track/:flagName'
    },
    documentation: 'https://docs.releasepeace.com/sdk'
  });
});

app.post('/sdk/evaluate/:flagName', (req, res) => {
  const { flagName } = req.params;
  const { user = {}, environment = 'production' } = req.body;
  
  // Mock flag evaluation
  const mockResult = {
    active: Math.random() > 0.5, // Random true/false for demo
    reason: 'mock_evaluation',
    cached: false,
    timestamp: new Date().toISOString()
  };
  
  res.json(mockResult);
});

app.post('/sdk/evaluate-bulk', (req, res) => {
  const { flags = [], user = {}, environment = 'production' } = req.body;
  
  if (!Array.isArray(flags) || flags.length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'flags array is required'
    });
  }
  
  const results = {};
  flags.forEach(flagName => {
    results[flagName] = {
      active: Math.random() > 0.5,
      reason: 'mock_evaluation'
    };
  });
  
  res.json({
    results,
    timestamp: new Date().toISOString(),
    user: user.id || 'anonymous'
  });
});

app.post('/sdk/track/:flagName', (req, res) => {
  const { flagName } = req.params;
  const { user = {}, event, value, environment = 'production' } = req.body;
  
  console.log('📊 Tracking metric:', { flagName, event, value, environment, userId: user.id });
  
  res.json({
    success: true,
    timestamp: new Date().toISOString()
  });
});

// ========== ERROR HANDLING ==========


// ...existing code...

// ---------- 404 ----------
app.use('*', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- ERROR HANDLER (last) ----------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// ========== SERVER STARTUP ==========

const startServer = async () => {
  try {
    // Initialize database (but don't fail if it doesn't work)
    await initDatabase();
    
    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server started successfully!');
      console.log(`🚀 ReleasePeace API running on port ${PORT}`);
      console.log(`🔗 Health: https://releasepeace-production.up.railway.app/health`);
      console.log(`📡 API: https://releasepeace-production.up.railway.app/api`);
      console.log(`🎯 SDK: https://releasepeace-production.up.railway.app/sdk`);
      console.log(`🌐 Frontend: https://release-peace.vercel.app`);
      console.log(`💾 Database: ${dbConnected ? 'Connected' : 'Mock Mode'}`);
    });
    
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the application
startServer();