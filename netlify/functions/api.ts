process.env.NETLIFY = 'true';

import serverless from 'serverless-http';
import app from '../../src/app';
import { connectDB } from '../../src/config/db.config';

let isDbConnected = false;

// Configure serverless-http with URL rewrite handling for Netlify redirects
const serverlessHandler = serverless(app, {
  request: (req: any, event: any) => {
    req.ip = (event.headers && (event.headers['client-ip'] || event.headers['x-forwarded-for'])) || '127.0.0.1';
    let p = event.path || '';
    if (p.startsWith('/.netlify/functions/api')) {
      p = p.replace('/.netlify/functions/api', '');
      if (!p.startsWith('/')) {
        p = '/' + p;
      }
      // If rewritten from /api/* (e.g. /.netlify/functions/api/portfolios -> /portfolios),
      // restore the /api prefix so Express routes match correctly
      if (!p.startsWith('/api') && !p.startsWith('/p/') && p !== '/health') {
        p = '/api' + p;
      }
      req.url = p;
    }
  }
});

export const handler = async (event: any, context: any) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  if (event && event.headers) {
    if (!event.headers['x-forwarded-for'] && !event.headers['client-ip']) {
      event.headers['x-forwarded-for'] = '127.0.0.1';
    }
  }

  if (!isDbConnected) {
    try {
      await connectDB();
      isDbConnected = true;
    } catch (error) {
      console.error('Failed to connect to MongoDB in serverless handler:', error);
    }
  }

  return serverlessHandler(event, context);
};

export default handler;
