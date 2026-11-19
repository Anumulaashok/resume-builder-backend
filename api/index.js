const app = require('../dist/app').default;
const { connectDB } = require('../dist/config/db.config');

module.exports = async function handler(req, res) {
  // Health, docs and CORS preflight must answer even when the database is unreachable.
  const path = (req.url || '').split('?')[0];
  const needsDb = req.method !== 'OPTIONS' && path !== '/health' && !path.startsWith('/api-docs');
  if (needsDb) {
    try {
      await connectDB();
    } catch (error) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
  }
  return app(req, res);
};
