import { Request, Response } from 'express';
import { authService } from '../services/auth.service';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; };

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    // Attempt to find the user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Use generic error for unknown email
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Compare passwords
    const isValidPassword = await authService.comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      // Use generic error for wrong password
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Generate token
    const token = authService.generateToken({
      userId: user.id,
      role: user.role,
    });

    // Set HttpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    // Return safe user payload (no token)
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        forcePasswordChange: user.forcePasswordChange,
      },
    });
  } catch (error) {
    console.error('[Auth Controller - Login] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    // req.user is guaranteed by the authenticateUser middleware
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        ...req.user,
        forcePasswordChange: (await prisma.user.findUnique({ where: { id: req.user.id } }))?.forcePasswordChange
      },
    });
  } catch (error) {
    console.error('[Auth Controller - getMe] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Current password and new password are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: 'New password must be at least 8 characters long' });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ success: false, message: 'New password must be different from current password' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const isValidPassword = await authService.comparePassword(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      res.status(401).json({ success: false, message: 'Incorrect current password' });
      return;
    }

    const passwordHash = await authService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        passwordHash,
        forcePasswordChange: false
      }
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('[Auth Controller - changePassword] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/'
    });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth Controller - Logout] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
