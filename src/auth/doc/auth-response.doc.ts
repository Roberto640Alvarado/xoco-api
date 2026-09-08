import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDoc } from '../../users/doc/user-response.doc.js';

export class AuthResponseDoc {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ type: UserResponseDoc })
  user: UserResponseDoc;
}
