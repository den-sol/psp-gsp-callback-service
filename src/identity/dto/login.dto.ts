import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  brandId: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
