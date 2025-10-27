import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsUUID, IsUrl } from 'class-validator';

export class CreateVideoDto {
  @IsNotEmpty()
  @IsUUID()
  topic_id: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  video_path: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsUrl()
  tryout_link?: string; // new field
}
