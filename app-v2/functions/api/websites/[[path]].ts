// GET /api/websites/* — see server/websites.ts.
import { handleWebsites, type WebsitesEnv } from '../../../server/websites';

interface EventContext {
  request: Request;
  env: WebsitesEnv;
}

export const onRequest = (context: EventContext): Promise<Response> => handleWebsites(context.request, context.env);
