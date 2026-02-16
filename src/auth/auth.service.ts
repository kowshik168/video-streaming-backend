import { Injectable, BadRequestException } from '@nestjs/common';
import { supabase } from '../supabase/supabase.client';
import { SignupDto } from './dto/signup.dto';
import { RecentActivityService } from '../recent-activity/recent-activity.service';

@Injectable()
export class AuthService {
  constructor(private readonly recentActivity: RecentActivityService) {}

  async signup(dto: SignupDto) {
    const { email, password, user_name } = dto;

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw new BadRequestException(error.message);

    // Signup creates only role=user accounts (admins are added separately).
    // role is required by DB; set explicitly so it is never null (e.g. if a trigger also inserts).
    const defaultRole = 'user';
    const { error: userError } = await supabase.from('Users').insert([
      {
        email_id: email.trim().toLowerCase(),
        user_name: user_name ?? '',
        role: defaultRole,
        auth_user_id: data.user?.id ?? null,
      },
    ]);

    if (userError) throw new BadRequestException(userError.message);

    if (data.user?.id) {
      await this.recentActivity.log(data.user.id, 'signup');
    }
    return { message: 'User created successfully' };
  }

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new BadRequestException(error.message);

    // console.log('🔹 Full Auth Data:', data);

    const email_id = data.user?.email?.trim().toLowerCase();
    // console.log('🔹 Supabase Auth Email:', email_id);

    // ✅ Correct case-sensitive table reference
    const { data: allData, error: userError } = await supabase
      .from("Users")  // 👈 explicit schema + quoted case
      .select('user_name, role, email_id')
      .eq('email_id', email_id);
    console.log(allData);

    // console.log('🔹 Query result:', allData);
    // console.log('🔹 Query error:', userError);

    if (userError) throw new BadRequestException(userError.message);
    if (!allData || allData.length === 0)
      throw new BadRequestException(`No user found for this email_id: ${email_id}`);

    const userData = allData[0];
    if (data.user?.id) {
      await this.recentActivity.log(data.user.id, 'login');
    }
    return {
      token: data.session?.access_token,
      user: {
        email_id: userData.email_id,
        user_name: userData.user_name,
        role: userData.role,
      },
    };
  }

}

