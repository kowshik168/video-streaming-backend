import { Injectable, BadRequestException } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  async signup(dto: SignupDto) {
    const { email, password, user_name, role } = dto;

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw new BadRequestException(error.message);

    // Insert profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: data.user?.id,
          user_name,
          role,
        },
      ]);

    if (profileError) throw new BadRequestException(profileError.message);

    return { message: 'User created successfully' };
  }

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new BadRequestException(error.message);

    return {
      token: data.session?.access_token,
      user: data.user,
    };
  }
}
