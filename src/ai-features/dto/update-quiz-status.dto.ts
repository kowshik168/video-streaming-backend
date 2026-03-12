import { IsIn } from 'class-validator';

export class UpdateQuizStatusDto {
  @IsIn(['draft', 'published'])
  status!: 'draft' | 'published';
}
