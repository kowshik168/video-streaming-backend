import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsUrl } from 'class-validator';

// One-shot upload DTO: includes topic name instead of topic_id.
export class CreateVideoWithTopicDto {
  @IsNotEmpty()
  @IsString()
  topic_name: string;

  @IsOptional()
  @IsString()
  topic_description?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Absolute path on server HDD for upload endpoint
  @IsNotEmpty()
  @IsString()
  video_path: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsUrl()
  tryout_link?: string;
}

