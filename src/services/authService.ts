import jwt from 'jsonwebtoken';
import { IUserRepository } from '../repositories/userRepository';
import { AppError } from '../utils/appError';

export class AuthService {
  constructor(private userRepository: IUserRepository) {}

  private generateToken(id: string): string {
    return jwt.sign({ id }, process.env.JWT_SECRET!, {
      expiresIn: '30d'
    });
  }

  async signup(data: { name: string; email: string; password: string }) {
    const userExists = await this.userRepository.findByEmail(data.email);
    if (userExists) {
      throw new AppError('User already exists', 400);
    }

    const user = await this.userRepository.create(data);
    
    return {
      success: true,
      message: 'User registered successfully',
      token: this.generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    };
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !(await user.matchPassword(password))) {
      throw new AppError('Invalid credentials', 401);
    }

    return {
      success: true,
      message: 'Login successful',
      token: this.generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    };
  }
}
