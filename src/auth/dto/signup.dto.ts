import { IsEmail, IsIn, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
  @IsNotEmpty()
  user_name: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;

  @IsIn(['admin', 'user'], { message: 'Role must be either admin or user' })
  role: string;
}
