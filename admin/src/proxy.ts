// Next.js 16 renamed middleware.ts -> proxy.ts. On Next 15 or older, rename this file to middleware.ts
// and the exported function to `middleware`, otherwise sessions never refresh.
import { type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
