const app = require('../dist/app').default;
const { connectDB } = require('../dist/config/db.config');

module.exports = async function handler(req, res) {
  // Health checks must answer even when the database is unreachable.
  if (req.url !== '/health') {
    try {
      await connectDB();
    } catch (error) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
  }
  return app(req, res);
};
