import {
  Body,
  Controller,
  MessageEvent,
  RequestMethod,
  Sse,
} from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { CurrentUser } from '../../decorators/current-user.decorator';
import { ApiAuth } from '../../decorators/http.decorators';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { AskReqDto } from './dto/ask.req.dto';
import { InteractiveAgentService } from './interactive-agent.service';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    private readonly interactiveAgentService: InteractiveAgentService,
  ) {}

  // `@Sse` defaults to GET; the question and conversation id travel in the body, so it is POST.
  @Sse('ask', { [METHOD_METADATA]: RequestMethod.POST })
  @ApiAuth({
    summary:
      'Ask the assistant a question (streamed, remembers the conversation)',
    description:
      'Server-Sent Events: `delta` {text} for each piece of the answer, then `done`. ' +
      'Read it with fetch + a stream reader (EventSource cannot send POST).',
  })
  @ApiProduces('text/event-stream')
  ask(
    @CurrentUser() payload: JwtPayloadType,
    @Body() { conversationId, question }: AskReqDto,
  ): Observable<MessageEvent> {
    return this.interactiveAgentService.stream(
      payload.sub,
      conversationId,
      question,
    );
  }
}
