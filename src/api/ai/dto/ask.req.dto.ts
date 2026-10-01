import { StringField, UUIDField } from '../../../decorators/field.decorators';

export class AskReqDto {
  @UUIDField({ description: 'Conversation id (client-generated UUID)' })
  readonly conversationId!: string;

  @StringField({ description: 'Question to send to the model' })
  readonly question!: string;
}
