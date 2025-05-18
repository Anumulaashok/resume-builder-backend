import { UserRepository } from '../repositories/userRepository';
import { AuthService } from '../services/authService';

export class Container {
  private static instance: Container;
  private services: Map<string, any> = new Map();

  private constructor() {
    // Repositories
    const userRepository = new UserRepository();

    // Services
    const authService = new AuthService(userRepository);

    // Register services
    this.services.set('authService', authService);
  }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  getService<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }
    return service;
  }
}

export const container = Container.getInstance();
