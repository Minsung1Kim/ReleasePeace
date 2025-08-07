// backend/src/index.js - COMPLETE WORKING VERSION
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// CRITICAL FIX: Trust Railway's proxy
app.set('trust proxy', 1);

console.log('🚀 Starting ReleasePeace API...');
console.log('📍 Port:', PORT);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Initialize cache for flag evaluations (60 second TTL)
const flagCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Middleware - Security
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

// CORS - Allow your frontend domains
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

// Logging
app.use(morgan('combined'));

// Rate limiting - NOW WORKS WITH RAILWAY
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

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'ReleasePeace API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/health',
      users: '/api/users/*',
      companies: '/api/companies/*',
      flags: '/api/flags/*',
      sdk: '/sdk/*'
    }
  });
});

// Initialize database and routes
async function initializeApp() {
  try {
    console.log('📦 Initializing database...');
    
    // Import models and test connection
    const { sequelize } = require('./models');
    
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection established');
      
      // Sync database models for all environments
      await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
      console.log('✅ Database models synchronized');
      
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      // Continue without database - some routes will still work
    }

    console.log('🛣️ Setting up routes...');
    
    try {
      // Import routes
      const userRoutes = require('./routes/users');
      const companyRoutes = require('./routes/companies');
      const flagRoutes = require('./routes/flags');
      const analyticsRoutes = require('./routes/analytics');
      const sdkRoutes = require('./routes/sdk');
      
      // Setup API routes
      app.use('/api/users', userRoutes);
      app.use('/api/companies', companyRoutes);
      app.use('/api/flags', flagRoutes);
      app.use('/api/analytics', analyticsRoutes);
      app.use('/sdk', sdkRoutes);
      
      console.log('✅ API routes configured');
      
    } catch (routeError) {
      console.error('❌ Route setup failed:', routeError.message);
      
      // Fallback routes if imports fail
      app.use('/api/*', (req, res) => {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'API routes not loaded properly'
        });
      });
    }

    // Additional SDK endpoints
    try {
      const flagService = require('./services/flagService');
      
      // Fast flag evaluation endpoint
      app.post('/sdk/evaluate/:flagName', async (req, res) => {
        try {
          const { flagName } = req.params;
          const { user = {}, environment = 'production' } = req.body;
          
          const cacheKey = `flag:${flagName}:${environment}:${JSON.stringify(user)}`;
          let result = flagCache.get(cacheKey);
          
          if (result === undefined) {
            result = await flagService.evaluateFlag(flagName, user, environment);
            flagCache.set(cacheKey, result);
          }
          
          res.json({
            active: result.active,
            reason: result.reason,
            cached: result !== undefined,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error('Flag evaluation error:', error);
          res.json({
            active: false,
            reason: 'evaluation_error',
            timestamp: new Date().toISOString()
          });
        }
      });

      // Bulk evaluation endpoint
      app.post('/sdk/evaluate-bulk', async (req, res) => {
        try {
          const { flags = [], user = {}, environment = 'production' } = req.body;
          
          if (!Array.isArray(flags) || flags.length === 0) {
            return res.status(400).json({
              error: 'Invalid request',
              message: 'flags array is required'
            });
          }
          
          if (flags.length > 50) {
            return res.status(400).json({
              error: 'Too many flags',
              message: 'Maximum 50 flags allowed'
            });
          }
          
          const results = {};
          const promises = flags.map(async (flagName) => {
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
          
          await Promise.all(promises);
          
          res.json({
            results,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error('Bulk evaluation error:', error);
          res.status(500).json({
            error: 'evaluation_error',
            message: 'Bulk evaluation failed'
          });
        }
      });

      // Track metric endpoint
      app.post('/sdk/track/:flagName', async (req, res) => {
        try {
          const { flagName } = req.params;
          const { user = {}, event, value, environment = 'production' } = req.body;
          
          // Async tracking
          setImmediate(async () => {
            try {
              await flagService.trackMetric(flagName, user, event, value, environment);
            } catch (error) {
              console.error('Tracking error:', error);
            }
          });
          
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
      
      console.log('✅ SDK endpoints configured');
      
    } catch (serviceError) {
      console.error('❌ SDK service setup failed:', serviceError.message);
    }

  } catch (error) {
    console.error('❌ App initialization failed:', error);
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
    timestamp: new Date().toISOString(),
    availableEndpoints: ['/health', '/api/users/login', '/api/companies', '/api/flags']
  });
});

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    const { sequelize } = require('./models');
    if (sequelize) {
      await sequelize.close();
      console.log('Database connection closed.');
    }
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the server
const startServer = async () => {
  try {
    // Initialize the app (database, routes, etc.)
    await initializeApp();
    
    // Start listening
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('✅ Server started successfully!');
      console.log(`🚀 ReleasePeace API running on port ${PORT}`);
      console.log(`🔗 Health: http://localhost:${PORT}/health`);
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`🎯 SDK: http://localhost:${PORT}/sdk`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ADD THESE DEBUG ROUTES TO YOUR backend/src/index.js 
// Add them right after the basic "/" route:

// Debug route to test if backend is working
app.get('/debug', (req, res) => {
  res.json({
    message: 'Debug endpoint working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    routes_loaded: 'checking...'
  });
});

// Test login route directly in main file (temporary)
app.post('/api/users/login-test', async (req, res) => {
  try {
    console.log('🔍 Direct login test hit!', req.body);
    
    const { username, role = 'pm' } = req.body;
    
    res.json({
      success: true,
      message: 'Direct login test working!',
      received: { username, role },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Direct login test error:', error);
    res.status(500).json({
      error: 'Direct login test failed',
      message: error.message
    });
  }
});

// Route to check what routes are actually mounted
app.get('/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on the app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  res.json({
    mounted_routes: routes,
    timestamp: new Date().toISOString()
  });
});


// Start the application
startServer();