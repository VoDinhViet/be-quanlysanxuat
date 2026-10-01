import type { RunnableConfig } from '@langchain/core/runnables';

/** Key under `configurable` that carries the asking user's id from the stream call to each tool. */
export const USER_ID_CONFIG_KEY = 'userId';

export function getUserIdFromConfig(config: RunnableConfig): string {
  const userId = config.configurable?.[USER_ID_CONFIG_KEY] as
    | string
    | undefined;
  if (!userId) {
    throw new Error('Tool was invoked without a user id in its config');
  }
  return userId;
}
