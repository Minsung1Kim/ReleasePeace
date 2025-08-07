const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

console.log('🚀 Starting ReleasePeace API...');
console.log('📍 Port:', PORT);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Initialize cache for flag evaluations (60 second TTL)
const flagCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Middleware
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

app.use(cors({
  origin: [
    'http://localhost:3000',           
    'https://release-peace.vercel.app', 
    'https://releasepeace-frontend.vercel.app',
    process.env.FRONTEND_URL          
  ].filter(Boolean), 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-ID']
}));

app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'ReleasePeace Feature Flag API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic route to test
app.get('/', (req, res) => {
  res.json({
    message: 'ReleasePeace API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      users: '/api/users/*',
      companies: '/api/companies/*',
      flags: '/api/flags/*',
      sdk: '/sdk/*'
    }
  });
});

// Initialize database and routes after basic setup
async function initializeApp() {
  try {
    console.log('📦 Initializing database...');
    
    // Import models and test connection
    const { sequelize } = require('./models');
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync database models 
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Database models synchronized');
    }

    // Import and setup routes
    console.log('🛣️  Setting up routes...');
    
    const userRoutes = require('./routes/users');
    const companyRoutes = require('./routes/companies');
    const flagRoutes = require('./routes/flags');
    const analyticsRoutes = require('./routes/analytics');
    const sdkRoutes = require('./routes/sdk');
    
    // Import services
    const flagService = require('./services/flagService');
    
    // Setup routes
    app.use('/api/users', userRoutes);
    app.use('/api/companies', companyRoutes);
    app.use('/api/flags', flagRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/sdk', sdkRoutes);

    // Fast flag evaluation endpoint (cached, optimized)
    app.post('/sdk/evaluate/:flagName', async (req, res) => {
      try {
        const { flagName } = req.params;
        const { user = {}, environment = 'production' } = req.body;
        
        // Create cache key
        const cacheKey = `flag:${flagName}:${environment}:${JSON.stringify(user)}`;
        
        // Check cache first
        let result = flagCache.get(cacheKey);
        
        if (result === undefined) {
          // Cache miss - evaluate flag
          result = await flagService.evaluateFlag(flagName, user, environment);
          
          // Cache the result
          flagCache.set(cacheKey, result);
          
          console.log(`Flag evaluation cache miss: ${flagName}`);
        }
        
        // Always return in <1ms for cached results
        res.json({
          active: result.active,
          reason: result.reason,
          cached: result !== undefined,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Flag evaluation error:', error);
        
        // Fail safe - always return false if there's an error
        res.json({
          active: false,
          reason: 'evaluation_error',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Bulk flag evaluation (for multiple flags at once)
    app.post('/sdk/evaluate-bulk', async (req, res) => {
      try {
        const { flags = [], user = {}, environment = 'production' } = req.body;
        
        if (!Array.isArray(flags) || flags.length === 0) {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'flags array is required and must not be empty'
          });
        }
        
        // Limit bulk evaluation to 50 flags at once
        if (flags.length > 50) {
          return res.status(400).json({
            error: 'Too many flags',
            message: 'Maximum 50 flags can be evaluated in one request'
          });
        }
        
        const results = {};
        const evaluationPromises = flags.map(async (flagName) => {
          const cacheKey = `flag:${flagName}:${environment}:${JSON.stringify(user)}`;
          let result = flagCache.get(cacheKey);
          
          if (result === undefined) {
            result = await flagService.evaluateFlag(flagName, user, environment);
            flagCache.set(cacheKey, result);
          }
          
          results[flagName] = {
            active: result.active,
            reason: result.reason
          };
        });
        
        await Promise.all(evaluationPromises);
        
        res.json({
          results,
          timestamp: new Date().toISOString(),
          user: user.id || 'anonymous'
        });
        
      } catch (error) {
        console.error('Bulk flag evaluation error:', error);
        res.status(500).json({
          error: 'evaluation_error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
      }
    });

    // Track conversion/metric endpoint
    app.post('/sdk/track/:flagName', async (req, res) => {
      try {
        const { flagName } = req.params;
        const { user = {}, event, value, environment = 'production' } = req.body;
        
        // Async tracking - don't block response
        setImmediate(async () => {
          try {
            await flagService.trackMetric(flagName, user, event, value, environment);
            console.log('Metric tracked', { flagName, event, value, userId: user.id, environment });
          } catch (error) {
            console.error('Metric tracking error:', error);
          }
        });
        
        // Return immediately
        res.json({
          success: true,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Track endpoint error:', error);
        res.status(500).json({
          error: 'tracking_error',
          message: 'Failed to track metric'
        });
      }
    });

    console.log('✅ Routes configured successfully');

  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    
    // Setup minimal routes even if DB fails
    app.use('/api/*', (req, res) => {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection failed'
      });
    });
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The endpoint ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    const { sequelize } = require('./models');
    await sequelize.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  try {
    const { sequelize } = require('./models');
    await sequelize.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Initialize and start server
initializeApp().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ReleasePeace API server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🎯 SDK endpoint: http://localhost:${PORT}/sdk/evaluate/{flagName}`);
    console.log(`📊 Admin API: http://localhost:${PORT}/api`);
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  
  // Start server anyway with basic routes
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ReleasePeace API server running on port ${PORT} (limited mode)`);
  });
});