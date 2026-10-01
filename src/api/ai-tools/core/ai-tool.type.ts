import type { StructuredToolInterface } from '@langchain/core/tools';

/** A group of related tools (one business domain) that the agent can call. */
export interface AiToolProvider {
  getTools(): StructuredToolInterface[];
}
