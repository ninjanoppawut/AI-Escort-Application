import { NextRequest } from "next/server";
import { z } from "zod";

import { getExport } from "@/features/exports/server/operations";
import { handleReviewRead } from "@/features/observations/review/server/route-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ exportId: z.uuid() });

// Export status for its requester; never a storage path or signed URL.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
) {
  return handleReviewRead(
    request,
    context.params,
    paramsSchema,
    async (params) => {
      const result = await getExport(
        await createSupabaseServerClient(),
        params.exportId,
      );
      return result;
    },
  );
}
