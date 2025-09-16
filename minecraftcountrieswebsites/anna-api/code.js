const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'ANNA Webhook Proxy',
    version: '1.0.0'
  });
});

// Root endpoint info
app.get('/', (req, res) => {
  res.json({
    service: 'ANNA Webhook Proxy',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /anna/submit-application': 'Submit ANNA domain application'
    },
    status: 'running'
  });
});

// ANNA application submission endpoint
app.post('/anna/submit-application', async (req, res) => {
  console.log('Received ANNA application submission');
  console.log('Request body keys:', Object.keys(req.body));
  
  if (!DISCORD_WEBHOOK) {
    console.error('DISCORD_WEBHOOK_URL environment variable not set');
    return res.status(500).json({
      success: false,
      error: 'Server configuration error - Discord webhook not configured'
    });
  }

  try {
    console.log('Forwarding to Discord webhook...');
    
    const response = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ANNA-Webhook-Proxy/1.0'
      },
      body: JSON.stringify(req.body)
    });

    const responseText = await response.text();
    
    if (response.ok) {
      console.log('Successfully forwarded to Discord');
      console.log('Discord response:', response.status, responseText);
      
      res.json({
        success: true,
        message: 'Application submitted successfully'
      });
    } else {
      console.error('Discord webhook failed:', response.status, response.statusText);
      console.error('Discord error response:', responseText);
      
      res.status(500).json({
        success: false,
        error: 'Failed to submit application to Discord'
      });
    }
  } catch (error) {
    console.error('Error forwarding to Discord:', error.message);
    console.error('Full error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Catch all for undefined routes
app.use('*', (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    requested: req.originalUrl,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /anna/submit-application'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================');
  console.log(`ANNA Webhook Proxy v1.0.0`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('====================================');
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Root endpoint: http://localhost:${PORT}/`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/anna/submit-application`);
  console.log(`Discord webhook configured: ${DISCORD_WEBHOOK ? 'YES' : 'NO'}`);
  console.log('====================================');
  
  if (!DISCORD_WEBHOOK) {
    console.warn('⚠️  WARNING: DISCORD_WEBHOOK_URL environment variable not set!');
    console.warn('   Applications will fail until webhook URL is configured.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
