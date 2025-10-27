import { IsNotEmpty, IsUUID, IsString } from 'class-validator';

export class CreateCommentDto {
  @IsNotEmpty()
  @IsUUID()
  video_id: string;

  @IsNotEmpty()
  @IsString()
  content: string;
}
