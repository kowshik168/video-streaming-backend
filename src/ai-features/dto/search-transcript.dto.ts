import { IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchTranscriptDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsOptional()
  @Min(1)
  @Max(25)
  limit?: number;

  @IsOptional()
  @Min(0.1)
  @Max(0.95)
  threshold?: number;
}
