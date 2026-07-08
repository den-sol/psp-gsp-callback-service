import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'brand-a', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  brandId: string;

  @ApiProperty({ example: 'alice@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'sup3rsecret' })
  @IsString()
  @MinLength(1)
  password: string;
}
