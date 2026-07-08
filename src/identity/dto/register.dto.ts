import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'brand-a', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  brandId: string;

  @ApiProperty({ example: 'alice@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'sup3rsecret', minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
