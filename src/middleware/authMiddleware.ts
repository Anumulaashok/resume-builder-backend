import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config'; // Assuming config file exports JWT secret
import User from '../models/User'; // Adjust path as needed

// Define the structure of the JWT payload
interface JwtPayload {
  id: string;
}

const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token;

  // Check for token in Authorization header (Bearer token)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

      // Get user from the token payload ID, excluding the password
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        // If user associated with token doesn't exist anymore
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      next(); // Proceed to the next middleware or route handler
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

export { protect };
