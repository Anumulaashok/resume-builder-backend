import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { UserRepository } from '../repositories/userRepository';
import { AppError } from '../utils/appError';

const userRepository = new UserRepository();
const authService = new AuthService(userRepository);

export const signup = async (req: Request, res: Response) => {
    const result = await authService.signup(req.body);
    res.status(201).json(result);
};

export const login = async (req: Request, res: Response) => {
      const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
};
