import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // 🧩 Check if header exists and is valid
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ Missing or invalid Authorization header');
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    // 🧩 Extract the token part (after "Bearer ")
    const token = authHeader.split(' ')[1]?.trim();
    if (!token) {
      console.error('❌ Empty token after Bearer');
      throw new UnauthorizedException('Empty token');
    }

    console.log('🔹 Received token (truncated):', token.slice(0, 25) + '...');

    try {
      // 🧩 Validate with Supabase
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data?.user) {
        console.error('❌ Invalid token:', error?.message || 'Unknown error');
        throw new UnauthorizedException('Invalid or expired token');
      }

      // ✅ Success — attach user to request
      console.log('✅ Authenticated user:', data.user.email);
      request.user = data.user;
      return true;
    } catch (err) {
      console.error('❌ AuthGuard Error:', err.message || err);
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
