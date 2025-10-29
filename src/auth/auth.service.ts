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

    // ✅ Insert into Users table (use email_id, not email)
    const { error: userError } = await supabase.from('Users').insert([
      {
        email_id: email, // 👈 fixed field name
        user_name,
        role,
      },
    ]);

    if (userError) throw new BadRequestException(userError.message);

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

