import { User, IUser } from '../models/User';

export interface IUserRepository {
  findByEmail(email: string): Promise<IUser | null>;
  create(data: { name: string; email: string; password: string }): Promise<IUser>;
  findById(id: string): Promise<IUser | null>;
}

export class UserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }

  async create(data: { name: string; email: string; password: string }): Promise<IUser> {
    return User.create(data);
  }

  async findById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }
}
