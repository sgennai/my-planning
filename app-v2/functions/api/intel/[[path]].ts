// GET /api/intel/* — see server/intel.ts.
import { handleIntel, type IntelEnv } from '../../../server/intel';

interface EventContext {
  request: Request;
  env: IntelEnv;
}

export const onRequest = (context: EventContext): Promise<Response> => handleIntel(context.request, context.env);
