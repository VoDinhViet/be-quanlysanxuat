import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schemas';

export type Database = PostgresJsDatabase<typeof schema>;
