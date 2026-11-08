import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register') register(@Body() body: {email:string;password:string;inviteCode:string}) { return this.auth.register(body); }
  @Post('login') login(@Body() body: {email:string;password:string}) { return this.auth.login(body); }
}
