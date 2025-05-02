import { Request, Response } from 'express';
import jwt from 'jsonwebtoken'; // Import jwt
import User from '../models/User';
import bcrypt from 'bcrypt';
import config from '../config'; // Import config

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
export const registerUser = async (req: Request, res: Response) => { // Add types and export
  const { name, email, password } = req.body;

  try {
    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user instance
    user = new User({
      name,
      email,
      password,
    });

    // Generate salt & hash password
    const salt = await bcrypt.genSalt(10); // 10 rounds is generally recommended
    user.password = await bcrypt.hash(password, salt);

    // Save user to database
    const savedUser = await user.save();

    // Generate JWT
    const token = jwt.sign({ id: savedUser._id }, config.jwtSecret, {
      expiresIn: '7d', // Token expires in 7 days
    });

    res.status(201).json({
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
      },
      token,
    });

  } catch (error: any) { // Add type annotation for error
    console.error('Registration error:', error.message);
    res.status(500).send('Server error during registration');
  }
};

// @desc    Authenticate user & get token (login)
// @route   POST /api/users/login
// @access  Public
export const loginUser = async (req: Request, res: Response) => { // Add types and export
  const { email, password } = req.body;

  try {
    // Check for user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare provided password with stored hash
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Passwords match - Generate JWT
    const token = jwt.sign({ id: user._id }, config.jwtSecret, {
      expiresIn: '7d',
    });

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      token,
    });

  } catch (error: any) { // Add type annotation for error
    console.error('Login error:', error.message);
    res.status(500).send('Server error during login');
  }
};

// Remove module.exports as functions are exported individually
