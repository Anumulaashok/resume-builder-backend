import request from 'supertest';
import app from '../app'; // Assuming app is exported from app.ts
import mongoose from 'mongoose';
import User from '../models/User'; // Adjust path as needed

// Use the main app instance for testing
const agent = request.agent(app);

describe('User API: /api/users', () => {

  // Clear user collection before each test in this suite
  beforeEach(async () => {
    await User.deleteMany({});
  });

  // Test Registration
  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const res = await agent
        .post('/api/users/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        });
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('test@example.com');
    });

    it('should return 400 if email is already registered', async () => {
      // First, register a user
      await agent
        .post('/api/users/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
        });

      // Try registering again with the same email
      const res = await agent
        .post('/api/users/register')
        .send({
          name: 'Another User',
          email: 'test@example.com', // Same email
          password: 'password456',
        });
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('User already exists');
    });
  });

  // Test Login
  describe('POST /login', () => {
    // Register a user before login tests
    beforeEach(async () => {
      await agent
        .post('/api/users/register')
        .send({
          name: 'Login User',
          email: 'login@example.com',
          password: 'password123',
        });
    });

    it('should login an existing user successfully', async () => {
      const res = await agent
        .post('/api/users/login')
        .send({
          email: 'login@example.com',
          password: 'password123',
        });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('login@example.com');
    });

    it('should return 400 for wrong password', async () => {
      const res = await agent
        .post('/api/users/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword', // Incorrect password
        });
      // Note: The controller returns 400 for invalid credentials (email or password)
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should return 400 if user email does not exist', async () => {
      const res = await agent
        .post('/api/users/login')
        .send({
          email: 'nonexistent@example.com', // Non-existent email
          password: 'password123',
        });
      // Note: The controller returns 400 for invalid credentials (email or password)
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Invalid credentials');
    });
  });

});
