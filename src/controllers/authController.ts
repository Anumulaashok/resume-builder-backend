import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { UserRepository } from '../repositories/userRepository';
import { AppError } from '../utils/appError';

const userRepository = new UserRepository();
const authService = new AuthService(userRepository);

export const signup = async (req: Request, res: Response) => {
  try {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Registration failed', 400);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : 'Login failed', 401);
  }
};
